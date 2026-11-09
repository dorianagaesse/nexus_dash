-- Preserve the access previously implied by task scopes. Newly created grants are explicit.
INSERT INTO "ApiCredentialScopeGrant" ("credentialId", scope, "createdAt")
SELECT g."credentialId", m.new_scope::"ApiCredentialScope", now()
FROM "ApiCredentialScopeGrant" g
JOIN (VALUES
 ('task_read','meeting_read'), ('task_read','epic_read'),
 ('task_write','meeting_write'), ('task_write','epic_write'),
 ('task_write','meeting_delete'), ('task_write','epic_delete')
) AS m(old_scope,new_scope) ON g.scope::text = m.old_scope
ON CONFLICT DO NOTHING;

-- Fixed-path, actor-bound projection avoids recursive Project/Membership policies.
CREATE FUNCTION app.has_project_capability(target_project_id TEXT, capability TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
 SELECT EXISTS (
   SELECT 1 FROM "Project" p LEFT JOIN "ProjectMembership" m
     ON m."projectId" = p.id AND m."userId" = app.current_user_id()
   WHERE p.id = target_project_id AND capability IN ('task:read', 'task:write', 'task:delete', 'meeting:read', 'meeting:write', 'meeting:delete', 'context:read', 'context:write', 'context:delete', 'epic:read', 'epic:write', 'epic:delete', 'roadmap:read', 'roadmap:write', 'roadmap:delete', 'schedule:read', 'schedule:write', 'schedule:delete') AND (
     p."ownerId" = app.current_user_id() OR (
       m.id IS NOT NULL AND
       (m.capabilities IS NULL OR (jsonb_typeof(m.capabilities) = 'array' AND m.capabilities ? capability)) AND
       (capability LIKE '%:read' OR (m.role IN ('editor','owner') AND
         (capability LIKE '%:write' OR capability IN ('meeting:delete','epic:delete','roadmap:delete'))))
     )
   )
 );
$$;

-- Restrictions compose with existing tenant, role, private-note and author policies.
CREATE POLICY nd130_select ON "Task" AS RESTRICTIVE FOR SELECT
USING (app.has_project_capability("projectId", 'task:read'))
;
CREATE POLICY nd130_insert ON "Task" AS RESTRICTIVE FOR INSERT
WITH CHECK (app.has_project_capability("projectId", 'task:write'))
;
CREATE POLICY nd130_update ON "Task" AS RESTRICTIVE FOR UPDATE
USING (app.has_project_capability("projectId", 'task:write'))
WITH CHECK (app.has_project_capability("projectId", 'task:write'))
;
CREATE POLICY nd130_delete ON "Task" AS RESTRICTIVE FOR DELETE
USING (app.has_project_capability("projectId", 'task:delete'))
;
CREATE POLICY nd130_select ON "Resource" AS RESTRICTIVE FOR SELECT
USING (app.has_project_capability("projectId", 'context:read'))
;
CREATE POLICY nd130_insert ON "Resource" AS RESTRICTIVE FOR INSERT
WITH CHECK (app.has_project_capability("projectId", 'context:write'))
;
CREATE POLICY nd130_update ON "Resource" AS RESTRICTIVE FOR UPDATE
USING (app.has_project_capability("projectId", 'context:write'))
WITH CHECK (app.has_project_capability("projectId", 'context:write'))
;
CREATE POLICY nd130_delete ON "Resource" AS RESTRICTIVE FOR DELETE
USING (app.has_project_capability("projectId", 'context:delete'))
;
CREATE POLICY nd130_select ON "Epic" AS RESTRICTIVE FOR SELECT
USING (app.has_project_capability("projectId", 'epic:read'))
;
CREATE POLICY nd130_insert ON "Epic" AS RESTRICTIVE FOR INSERT
WITH CHECK (app.has_project_capability("projectId", 'epic:write'))
;
CREATE POLICY nd130_update ON "Epic" AS RESTRICTIVE FOR UPDATE
USING (app.has_project_capability("projectId", 'epic:write'))
WITH CHECK (app.has_project_capability("projectId", 'epic:write'))
;
CREATE POLICY nd130_delete ON "Epic" AS RESTRICTIVE FOR DELETE
USING (app.has_project_capability("projectId", 'epic:delete'))
;
CREATE POLICY nd130_select ON "RoadmapPhase" AS RESTRICTIVE FOR SELECT
USING (app.has_project_capability("projectId", 'roadmap:read'))
;
CREATE POLICY nd130_insert ON "RoadmapPhase" AS RESTRICTIVE FOR INSERT
WITH CHECK (app.has_project_capability("projectId", 'roadmap:write'))
;
CREATE POLICY nd130_update ON "RoadmapPhase" AS RESTRICTIVE FOR UPDATE
USING (app.has_project_capability("projectId", 'roadmap:write'))
WITH CHECK (app.has_project_capability("projectId", 'roadmap:write'))
;
CREATE POLICY nd130_delete ON "RoadmapPhase" AS RESTRICTIVE FOR DELETE
USING (app.has_project_capability("projectId", 'roadmap:delete'))
;
CREATE POLICY nd130_select ON "RoadmapEvent" AS RESTRICTIVE FOR SELECT
USING (app.has_project_capability("projectId", 'roadmap:read'))
;
CREATE POLICY nd130_insert ON "RoadmapEvent" AS RESTRICTIVE FOR INSERT
WITH CHECK (app.has_project_capability("projectId", 'roadmap:write'))
;
CREATE POLICY nd130_update ON "RoadmapEvent" AS RESTRICTIVE FOR UPDATE
USING (app.has_project_capability("projectId", 'roadmap:write'))
WITH CHECK (app.has_project_capability("projectId", 'roadmap:write'))
;
CREATE POLICY nd130_delete ON "RoadmapEvent" AS RESTRICTIVE FOR DELETE
USING (app.has_project_capability("projectId", 'roadmap:delete'))
;
CREATE POLICY nd130_select ON "ProjectMeetingNote" AS RESTRICTIVE FOR SELECT
USING (app.has_project_capability("projectId", 'meeting:read'))
;
CREATE POLICY nd130_insert ON "ProjectMeetingNote" AS RESTRICTIVE FOR INSERT
WITH CHECK (app.has_project_capability("projectId", 'meeting:write'))
;
CREATE POLICY nd130_update ON "ProjectMeetingNote" AS RESTRICTIVE FOR UPDATE
USING (app.has_project_capability("projectId", 'meeting:write'))
WITH CHECK (app.has_project_capability("projectId", 'meeting:write'))
;
CREATE POLICY nd130_delete ON "ProjectMeetingNote" AS RESTRICTIVE FOR DELETE
USING (app.has_project_capability("projectId", 'meeting:delete'))
;
CREATE POLICY nd130_select ON "TaskRelation" AS RESTRICTIVE FOR SELECT
USING (app.has_project_capability("projectId", 'task:read'))
;
CREATE POLICY nd130_insert ON "TaskRelation" AS RESTRICTIVE FOR INSERT
WITH CHECK (app.has_project_capability("projectId", 'task:write'))
;
CREATE POLICY nd130_update ON "TaskRelation" AS RESTRICTIVE FOR UPDATE
USING (app.has_project_capability("projectId", 'task:write'))
WITH CHECK (app.has_project_capability("projectId", 'task:write'))
;
CREATE POLICY nd130_delete ON "TaskRelation" AS RESTRICTIVE FOR DELETE
USING (app.has_project_capability("projectId", 'task:write'))
;
CREATE POLICY nd130_select ON "TaskComment" AS RESTRICTIVE FOR SELECT
USING (app.has_project_capability((SELECT t."projectId" FROM "Task" t WHERE t.id = "taskId"), 'task:read'))
;
CREATE POLICY nd130_insert ON "TaskComment" AS RESTRICTIVE FOR INSERT
WITH CHECK (app.has_project_capability((SELECT t."projectId" FROM "Task" t WHERE t.id = "taskId"), 'task:write'))
;
CREATE POLICY nd130_update ON "TaskComment" AS RESTRICTIVE FOR UPDATE
USING (app.has_project_capability((SELECT t."projectId" FROM "Task" t WHERE t.id = "taskId"), 'task:write'))
WITH CHECK (app.has_project_capability((SELECT t."projectId" FROM "Task" t WHERE t.id = "taskId"), 'task:write'))
;
CREATE POLICY nd130_delete ON "TaskComment" AS RESTRICTIVE FOR DELETE
USING (app.has_project_capability((SELECT t."projectId" FROM "Task" t WHERE t.id = "taskId"), 'task:write'))
;
CREATE POLICY nd130_select ON "TaskAttachment" AS RESTRICTIVE FOR SELECT
USING (app.has_project_capability((SELECT t."projectId" FROM "Task" t WHERE t.id = "taskId"), 'task:read'))
;
CREATE POLICY nd130_insert ON "TaskAttachment" AS RESTRICTIVE FOR INSERT
WITH CHECK (app.has_project_capability((SELECT t."projectId" FROM "Task" t WHERE t.id = "taskId"), 'task:write'))
;
CREATE POLICY nd130_update ON "TaskAttachment" AS RESTRICTIVE FOR UPDATE
USING (app.has_project_capability((SELECT t."projectId" FROM "Task" t WHERE t.id = "taskId"), 'task:write'))
WITH CHECK (app.has_project_capability((SELECT t."projectId" FROM "Task" t WHERE t.id = "taskId"), 'task:write'))
;
CREATE POLICY nd130_delete ON "TaskAttachment" AS RESTRICTIVE FOR DELETE
USING (app.has_project_capability((SELECT t."projectId" FROM "Task" t WHERE t.id = "taskId"), 'task:write'))
;
CREATE POLICY nd130_select ON "TaskBlockedFollowUp" AS RESTRICTIVE FOR SELECT
USING (app.has_project_capability((SELECT t."projectId" FROM "Task" t WHERE t.id = "taskId"), 'task:read'))
;
CREATE POLICY nd130_insert ON "TaskBlockedFollowUp" AS RESTRICTIVE FOR INSERT
WITH CHECK (app.has_project_capability((SELECT t."projectId" FROM "Task" t WHERE t.id = "taskId"), 'task:write'))
;
CREATE POLICY nd130_update ON "TaskBlockedFollowUp" AS RESTRICTIVE FOR UPDATE
USING (app.has_project_capability((SELECT t."projectId" FROM "Task" t WHERE t.id = "taskId"), 'task:write'))
WITH CHECK (app.has_project_capability((SELECT t."projectId" FROM "Task" t WHERE t.id = "taskId"), 'task:write'))
;
CREATE POLICY nd130_delete ON "TaskBlockedFollowUp" AS RESTRICTIVE FOR DELETE
USING (app.has_project_capability((SELECT t."projectId" FROM "Task" t WHERE t.id = "taskId"), 'task:write'))
;
CREATE POLICY nd130_select ON "TaskAssigneeChange" AS RESTRICTIVE FOR SELECT
USING (app.has_project_capability((SELECT t."projectId" FROM "Task" t WHERE t.id = "taskId"), 'task:read'))
;
CREATE POLICY nd130_insert ON "TaskAssigneeChange" AS RESTRICTIVE FOR INSERT
WITH CHECK (app.has_project_capability((SELECT t."projectId" FROM "Task" t WHERE t.id = "taskId"), 'task:write'))
;
CREATE POLICY nd130_update ON "TaskAssigneeChange" AS RESTRICTIVE FOR UPDATE
USING (app.has_project_capability((SELECT t."projectId" FROM "Task" t WHERE t.id = "taskId"), 'task:write'))
WITH CHECK (app.has_project_capability((SELECT t."projectId" FROM "Task" t WHERE t.id = "taskId"), 'task:write'))
;
CREATE POLICY nd130_delete ON "TaskAssigneeChange" AS RESTRICTIVE FOR DELETE
USING (app.has_project_capability((SELECT t."projectId" FROM "Task" t WHERE t.id = "taskId"), 'task:write'))
;
CREATE POLICY nd130_select ON "TaskCommentAgentMention" AS RESTRICTIVE FOR SELECT
USING (app.has_project_capability((SELECT t."projectId" FROM "Task" t WHERE t.id = "taskId"), 'task:read'))
;
CREATE POLICY nd130_insert ON "TaskCommentAgentMention" AS RESTRICTIVE FOR INSERT
WITH CHECK (app.has_project_capability((SELECT t."projectId" FROM "Task" t WHERE t.id = "taskId"), 'task:write'))
;
CREATE POLICY nd130_update ON "TaskCommentAgentMention" AS RESTRICTIVE FOR UPDATE
USING (app.has_project_capability((SELECT t."projectId" FROM "Task" t WHERE t.id = "taskId"), 'task:write'))
WITH CHECK (app.has_project_capability((SELECT t."projectId" FROM "Task" t WHERE t.id = "taskId"), 'task:write'))
;
CREATE POLICY nd130_delete ON "TaskCommentAgentMention" AS RESTRICTIVE FOR DELETE
USING (app.has_project_capability((SELECT t."projectId" FROM "Task" t WHERE t.id = "taskId"), 'task:write'))
;
CREATE POLICY nd130_select ON "TaskCommentReaction" AS RESTRICTIVE FOR SELECT
USING (app.has_project_capability((SELECT t."projectId" FROM "TaskComment" c JOIN "Task" t ON t.id=c."taskId" WHERE c.id="commentId"), 'task:read'))
;
CREATE POLICY nd130_insert ON "TaskCommentReaction" AS RESTRICTIVE FOR INSERT
WITH CHECK (app.has_project_capability((SELECT t."projectId" FROM "TaskComment" c JOIN "Task" t ON t.id=c."taskId" WHERE c.id="commentId"), 'task:write'))
;
CREATE POLICY nd130_update ON "TaskCommentReaction" AS RESTRICTIVE FOR UPDATE
USING (app.has_project_capability((SELECT t."projectId" FROM "TaskComment" c JOIN "Task" t ON t.id=c."taskId" WHERE c.id="commentId"), 'task:write'))
WITH CHECK (app.has_project_capability((SELECT t."projectId" FROM "TaskComment" c JOIN "Task" t ON t.id=c."taskId" WHERE c.id="commentId"), 'task:write'))
;
CREATE POLICY nd130_delete ON "TaskCommentReaction" AS RESTRICTIVE FOR DELETE
USING (app.has_project_capability((SELECT t."projectId" FROM "TaskComment" c JOIN "Task" t ON t.id=c."taskId" WHERE c.id="commentId"), 'task:write'))
;
CREATE POLICY nd130_select ON "ResourceAttachment" AS RESTRICTIVE FOR SELECT
USING (app.has_project_capability((SELECT r."projectId" FROM "Resource" r WHERE r.id="resourceId"), 'context:read'))
;
CREATE POLICY nd130_insert ON "ResourceAttachment" AS RESTRICTIVE FOR INSERT
WITH CHECK (app.has_project_capability((SELECT r."projectId" FROM "Resource" r WHERE r.id="resourceId"), 'context:write'))
;
CREATE POLICY nd130_update ON "ResourceAttachment" AS RESTRICTIVE FOR UPDATE
USING (app.has_project_capability((SELECT r."projectId" FROM "Resource" r WHERE r.id="resourceId"), 'context:write'))
WITH CHECK (app.has_project_capability((SELECT r."projectId" FROM "Resource" r WHERE r.id="resourceId"), 'context:write'))
;
CREATE POLICY nd130_delete ON "ResourceAttachment" AS RESTRICTIVE FOR DELETE
USING (app.has_project_capability((SELECT r."projectId" FROM "Resource" r WHERE r.id="resourceId"), 'context:write'))
;
CREATE POLICY nd130_select ON "ProjectMeetingNoteParticipant" AS RESTRICTIVE FOR SELECT
USING (app.has_project_capability((SELECT app.meeting_note_project_id("meetingNoteId")), 'meeting:read'))
;
CREATE POLICY nd130_insert ON "ProjectMeetingNoteParticipant" AS RESTRICTIVE FOR INSERT
WITH CHECK (app.has_project_capability((SELECT app.meeting_note_project_id("meetingNoteId")), 'meeting:write'))
;
CREATE POLICY nd130_update ON "ProjectMeetingNoteParticipant" AS RESTRICTIVE FOR UPDATE
USING (app.has_project_capability((SELECT app.meeting_note_project_id("meetingNoteId")), 'meeting:write'))
WITH CHECK (app.has_project_capability((SELECT app.meeting_note_project_id("meetingNoteId")), 'meeting:write'))
;
CREATE POLICY nd130_delete ON "ProjectMeetingNoteParticipant" AS RESTRICTIVE FOR DELETE
USING (app.has_project_capability((SELECT app.meeting_note_project_id("meetingNoteId")), 'meeting:write'))
;
CREATE POLICY nd130_select ON "ProjectMeetingNoteAction" AS RESTRICTIVE FOR SELECT
USING (app.has_project_capability((SELECT app.meeting_note_project_id("meetingNoteId")), 'meeting:read'))
;
CREATE POLICY nd130_insert ON "ProjectMeetingNoteAction" AS RESTRICTIVE FOR INSERT
WITH CHECK (app.has_project_capability((SELECT app.meeting_note_project_id("meetingNoteId")), 'meeting:write'))
;
CREATE POLICY nd130_update ON "ProjectMeetingNoteAction" AS RESTRICTIVE FOR UPDATE
USING (app.has_project_capability((SELECT app.meeting_note_project_id("meetingNoteId")), 'meeting:write'))
WITH CHECK (app.has_project_capability((SELECT app.meeting_note_project_id("meetingNoteId")), 'meeting:write'))
;
CREATE POLICY nd130_delete ON "ProjectMeetingNoteAction" AS RESTRICTIVE FOR DELETE
USING (app.has_project_capability((SELECT app.meeting_note_project_id("meetingNoteId")), 'meeting:write'))
;
CREATE POLICY nd130_select ON "ProjectMeetingNoteActionAssigneeChange" AS RESTRICTIVE FOR SELECT
USING (app.has_project_capability((SELECT app.meeting_note_project_id(a."meetingNoteId") FROM "ProjectMeetingNoteAction" a WHERE a.id="actionId"), 'meeting:read'))
;
CREATE POLICY nd130_insert ON "ProjectMeetingNoteActionAssigneeChange" AS RESTRICTIVE FOR INSERT
WITH CHECK (app.has_project_capability((SELECT app.meeting_note_project_id(a."meetingNoteId") FROM "ProjectMeetingNoteAction" a WHERE a.id="actionId"), 'meeting:write'))
;
CREATE POLICY nd130_update ON "ProjectMeetingNoteActionAssigneeChange" AS RESTRICTIVE FOR UPDATE
USING (app.has_project_capability((SELECT app.meeting_note_project_id(a."meetingNoteId") FROM "ProjectMeetingNoteAction" a WHERE a.id="actionId"), 'meeting:write'))
WITH CHECK (app.has_project_capability((SELECT app.meeting_note_project_id(a."meetingNoteId") FROM "ProjectMeetingNoteAction" a WHERE a.id="actionId"), 'meeting:write'))
;
CREATE POLICY nd130_delete ON "ProjectMeetingNoteActionAssigneeChange" AS RESTRICTIVE FOR DELETE
USING (app.has_project_capability((SELECT app.meeting_note_project_id(a."meetingNoteId") FROM "ProjectMeetingNoteAction" a WHERE a.id="actionId"), 'meeting:write'))
;

-- Invite acceptance must copy exactly the owner-issued grant, never self-elevate.
CREATE POLICY nd130_membership_grants ON "ProjectMembership" AS RESTRICTIVE FOR INSERT
WITH CHECK (app.is_project_owner("projectId") OR EXISTS (
 SELECT 1 FROM "ProjectInvitation" i WHERE i."projectId" = "ProjectMembership"."projectId"
 AND i."invitedEmail" = app.current_user_verified_email()
 AND i.role = "ProjectMembership".role
 AND i.capabilities IS NOT DISTINCT FROM "ProjectMembership".capabilities
 AND i."acceptedAt" IS NULL AND i."revokedAt" IS NULL AND i."replacedAt" IS NULL AND i."expiresAt" > now()
));
CREATE FUNCTION app.guard_invitation_capabilities() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
 IF NEW.capabilities IS DISTINCT FROM OLD.capabilities AND NOT app.is_project_owner(OLD."projectId") THEN
   RAISE EXCEPTION 'Only the project owner may change invitation capabilities' USING ERRCODE = '42501';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER nd130_invitation_grants BEFORE UPDATE ON "ProjectInvitation"
FOR EACH ROW EXECUTE FUNCTION app.guard_invitation_capabilities();

CREATE POLICY nd130_activity_read ON "ProjectActivityEvent" AS RESTRICTIVE FOR SELECT USING (
 CASE domain WHEN 'task' THEN app.has_project_capability("projectId", 'task:read')
 WHEN 'task-comment' THEN app.has_project_capability("projectId", 'task:read')
 WHEN 'context-card' THEN app.has_project_capability("projectId", 'context:read')
 WHEN 'meeting-note' THEN app.has_project_capability("projectId", 'meeting:read')
 WHEN 'epic' THEN app.has_project_capability("projectId", 'epic:read')
 ELSE app.is_project_owner("projectId") END
);

-- Shared channels carry invalidation only: permissions may change while a socket is open.
-- Clients fetch authorized content through normal service boundaries after each signal.
CREATE OR REPLACE FUNCTION app.broadcast_project_activity_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 BEGIN
  PERFORM realtime.send(jsonb_build_object(
   'projectId', NEW."projectId",
   'version', to_char(NEW.version AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
   'serverTime', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  ), 'project-activity', 'project:' || NEW."projectId" || ':activity', true);
 EXCEPTION WHEN OTHERS THEN RAISE WARNING 'project activity Broadcast failed: %', SQLERRM;
 END;
 RETURN NEW;
END; $$;

-- The invite ID already identifies the public landing projection. This additive
-- companion keeps older deployments compatible with the existing function shape.
CREATE FUNCTION app.get_project_invitation_capabilities(target_invitation_id TEXT)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT capabilities FROM "ProjectInvitation" WHERE id = target_invitation_id LIMIT 1; $$;
