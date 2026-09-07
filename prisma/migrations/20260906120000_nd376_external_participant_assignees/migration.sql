-- ND-376: Allow meeting todo assignees who are external participants.
--
-- Adds the `participant` value to the shared MeetingTodoActorKind enum so an
-- action assignee can reference an external (non-user, non-member) meeting
-- participant through assigneeKind = 'participant' plus the existing
-- assigneeDisplayNameSnapshot accountability column. Participant rows carry
-- no user/credential FK, so the existing ProjectMeetingNoteAction actor CHECK
-- constraints remain valid. The value is assignee-only by service validation;
-- creators, completers, and stewards stay human/agent.

ALTER TYPE "MeetingTodoActorKind" ADD VALUE 'participant';
