ALTER TABLE "Task" ADD COLUMN "contentRevision" INTEGER NOT NULL DEFAULT 0 CHECK ("contentRevision" >= 0);
ALTER TABLE "ProjectMeetingNote" ADD COLUMN "contentRevision" INTEGER NOT NULL DEFAULT 0 CHECK ("contentRevision" >= 0);
ALTER TABLE "Resource" ADD COLUMN "contentRevision" INTEGER NOT NULL DEFAULT 0 CHECK ("contentRevision" >= 0);

-- Revisions belong to the aggregate, including writes by legacy clients and
-- owner offboarding functions. Metadata-only activity never advances them.
-- A nested aggregate mutation advances a given record once per transaction.
CREATE FUNCTION public.nd_content_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  new_content jsonb;
  old_content jsonb;
  marker text;
  advanced jsonb;
BEGIN
  SELECT jsonb_object_agg(key, value) INTO new_content
    FROM jsonb_each(to_jsonb(NEW)) WHERE key = ANY(TG_ARGV);
  SELECT jsonb_object_agg(key, value) INTO old_content
    FROM jsonb_each(to_jsonb(OLD)) WHERE key = ANY(TG_ARGV);
  marker := TG_TABLE_NAME || ':' || NEW.id;
  advanced := COALESCE(NULLIF(current_setting('app.nd_content_revisions', true), ''), '[]')::jsonb;
  IF (new_content IS DISTINCT FROM old_content OR NEW."contentRevision" > OLD."contentRevision")
    AND NOT (advanced ? marker) THEN
    NEW."contentRevision" := OLD."contentRevision" + 1;
    PERFORM set_config('app.nd_content_revisions', (advanced || jsonb_build_array(marker))::text, true);
  ELSE
    NEW."contentRevision" := OLD."contentRevision";
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER task_content_revision BEFORE UPDATE ON "Task" FOR EACH ROW
EXECUTE FUNCTION public.nd_content_revision('title', 'description', 'blockedNote', 'deadlineAt',
  'status', 'archivedAt', 'label', 'labelsJson', 'epicId',
  'assigneeKind', 'assigneeUserId', 'assigneeCredentialId', 'assigneeDisplayNameSnapshot');
CREATE TRIGGER meeting_content_revision BEFORE UPDATE ON "ProjectMeetingNote" FOR EACH ROW
EXECUTE FUNCTION public.nd_content_revision('title', 'scheduledAt', 'status', 'labelsJson',
  'inputNotes', 'outputNotes', 'decisions', 'stewardKind', 'stewardUserId',
  'stewardCredentialId', 'stewardDisplayNameSnapshot');
CREATE TRIGGER resource_content_revision BEFORE UPDATE ON "Resource" FOR EACH ROW
EXECUTE FUNCTION public.nd_content_revision('type', 'name', 'content', 'color');

-- Invoker privileges preserve the parent table's forced RLS. Parent identity
-- comes from the child row, never from a request-supplied SQL identifier.
CREATE FUNCTION public.nd_child_content_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  row_data jsonb;
  old_data jsonb;
  parent_ids text[] := '{}';
  parent_id text;
  field_name text;
BEGIN
  IF TG_OP <> 'DELETE' THEN row_data := to_jsonb(NEW); END IF;
  IF TG_OP <> 'INSERT' THEN old_data := to_jsonb(OLD); END IF;
  IF TG_OP = 'UPDATE' AND
    (row_data - ARRAY['createdAt','updatedAt']) IS NOT DISTINCT FROM
    (old_data - ARRAY['createdAt','updatedAt']) THEN
    RETURN NULL;
  END IF;
  FOREACH field_name IN ARRAY TG_ARGV[1:array_length(TG_ARGV, 1)] LOOP
    parent_ids := parent_ids || ARRAY[row_data ->> field_name, old_data ->> field_name];
  END LOOP;
  FOR parent_id IN SELECT DISTINCT entry FROM unnest(parent_ids) AS entry
      WHERE entry IS NOT NULL ORDER BY entry LOOP
    EXECUTE format('UPDATE public.%I SET "contentRevision" = "contentRevision" + 1 WHERE id = $1', TG_ARGV[0])
      USING parent_id;
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE TRIGGER relation_content_revision AFTER INSERT OR DELETE OR UPDATE ON "TaskRelation"
FOR EACH ROW EXECUTE FUNCTION public.nd_child_content_revision('Task', 'leftTaskId', 'rightTaskId');
CREATE TRIGGER participant_content_revision AFTER INSERT OR DELETE OR UPDATE ON "ProjectMeetingNoteParticipant"
FOR EACH ROW EXECUTE FUNCTION public.nd_child_content_revision('ProjectMeetingNote', 'meetingNoteId');
CREATE TRIGGER todo_content_revision AFTER INSERT OR DELETE OR UPDATE ON "ProjectMeetingNoteAction"
FOR EACH ROW EXECUTE FUNCTION public.nd_child_content_revision('ProjectMeetingNote', 'meetingNoteId');
