# TASK-228 QStash Notification Email Scheduler Activation

Date: 2026-05-16
Status: Superseded by TASK-268 on 2026-05-19

## Summary

TASK-228 originally tracked activating Upstash QStash, or an equivalent managed
HTTP scheduler, for production notification email dispatch. That direction is no
longer active.

The project is moving forward with TASK-268 instead: GitHub Actions invokes the
protected notification email dispatcher every 3 hours as an early-production
bridge while Vercel remains on Hobby and no managed scheduler is in use.

## Reason

QStash remains a valid future scheduler option, but it created too much
operational friction for the current stage of the project. The active goal is to
ship a simpler production scheduler bridge and document the delivery caveat
honestly rather than block notification email dispatch on another provider setup.

## Replacement

Use:

```text
tasks/task-268-github-actions-notification-email-scheduler.md
```

TASK-268 owns the current scheduler implementation, production smoke plan, and
documentation updates.
