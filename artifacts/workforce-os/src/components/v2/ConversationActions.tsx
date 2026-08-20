import React from "react";
import {
  type ConversationDetail,
  type ConversationMeeting,
  useCancelConversationMeeting,
  useCompleteConversationMeeting,
  useConfirmConversationMeeting,
  useCreateConversationFollowUp,
  useCreateConversationMeeting,
  useCreateConversationReply,
  useArchiveConversation,
  useMarkConversationMeetingNoShow,
  useMarkConversationRead,
  useUnarchiveConversation,
  useUpdateConversationFollowUp,
  useUpdateConversationMeeting,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  CalendarPlus,
  Archive,
  ArchiveRestore,
  Check,
  CheckCheck,
  Clock3,
  ExternalLink,
  PenLine,
  X,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  defaultLocalDateTime,
  futureLocalDateTimeToIso,
  replySubject,
} from "@/lib/conversationActions";
import { cn } from "@/lib/utils";
import { decisionErrorMessage } from "@/lib/decisionError";

interface ConversationActionsProps {
  detail: ConversationDetail;
  className?: string;
  showArchiveControl?: boolean;
}

function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

interface MeetingDraft {
  title: string;
  scheduledFor: string;
  durationMinutes: string;
  notes: string;
}

function meetingDraftFrom(meeting: ConversationMeeting): MeetingDraft {
  return {
    title: meeting.title,
    scheduledFor: format(new Date(meeting.scheduledFor), "yyyy-MM-dd'T'HH:mm"),
    durationMinutes: String(meeting.durationMinutes),
    notes: meeting.notes ?? "",
  };
}

function localDateTimeToIso(value: string): string | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function ConversationActions({
  detail,
  className,
  showArchiveControl = true,
}: ConversationActionsProps) {
  const { conversation, pendingDraftId } = detail;
  const followUps = detail.followUps ?? [];
  const meetings = detail.meetings ?? [];
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [replyOpen, setReplyOpen] = React.useState(false);
  const [followUpOpen, setFollowUpOpen] = React.useState(false);
  const [meetingOpen, setMeetingOpen] = React.useState(false);
  const [meetingToEdit, setMeetingToEdit] =
    React.useState<ConversationMeeting | null>(null);
  const [meetingToCancel, setMeetingToCancel] =
    React.useState<ConversationMeeting | null>(null);
  const [terminalMeetingAction, setTerminalMeetingAction] = React.useState<{
    meeting: ConversationMeeting;
    outcome: "complete" | "no-show";
  } | null>(null);
  const [cancellationReason, setCancellationReason] = React.useState("");
  const [replyDraft, setReplyDraft] = React.useState({
    subject: replySubject(conversation.subject),
    body: "",
  });
  const [followUpDraft, setFollowUpDraft] = React.useState({
    dueAt: defaultLocalDateTime(24 * 60),
    note: "",
  });
  const [meetingDraft, setMeetingDraft] = React.useState({
    title: `Meeting with ${conversation.leadName}`,
    scheduledFor: defaultLocalDateTime(24 * 60),
    durationMinutes: "30",
    notes: "",
  });
  const [meetingEditDraft, setMeetingEditDraft] = React.useState<MeetingDraft>({
    title: "",
    scheduledFor: "",
    durationMinutes: "30",
    notes: "",
  });

  React.useEffect(() => {
    setReplyDraft({
      subject: replySubject(conversation.subject),
      body: "",
    });
    setMeetingDraft((current) => ({
      ...current,
      title: `Meeting with ${conversation.leadName}`,
    }));
  }, [conversation.id, conversation.leadName, conversation.subject]);

  React.useEffect(() => {
    if (conversation.archived) setReplyOpen(false);
  }, [conversation.archived]);

  const refreshConversation = React.useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: ["getConversation", conversation.id],
    });
    void queryClient.invalidateQueries({ queryKey: ["listConversations"] });
  }, [conversation.id, queryClient]);

  const markRead = useMarkConversationRead({
    mutation: {
      onSuccess: () => {
        toast.success("Marked as read");
        refreshConversation();
      },
      onError: () => toast.error("Couldn’t mark this conversation as read"),
    },
  });

  const archive = useArchiveConversation({
    mutation: {
      onSuccess: () => {
        toast.success("Archived; any unsent reply draft was stopped");
        refreshConversation();
      },
      onError: (error) => toast.error(decisionErrorMessage(error)),
    },
  });

  const unarchive = useUnarchiveConversation({
    mutation: {
      onSuccess: () => {
        toast.success("Restored to inbox");
        refreshConversation();
      },
      onError: (error) => toast.error(decisionErrorMessage(error)),
    },
  });

  const createReply = useCreateConversationReply({
    mutation: {
      onSuccess: (result) => {
        setReplyOpen(false);
        setReplyDraft((current) => ({ ...current, body: "" }));
        toast(result.message);
        refreshConversation();
        navigate(`/outbound/${result.runId}`);
      },
      onError: (error) => toast.error(decisionErrorMessage(error)),
    },
  });

  const createFollowUp = useCreateConversationFollowUp({
    mutation: {
      onSuccess: () => {
        setFollowUpOpen(false);
        setFollowUpDraft({
          dueAt: defaultLocalDateTime(24 * 60),
          note: "",
        });
        toast.success("Follow-up reminder created");
        refreshConversation();
      },
      onError: () => toast.error("Couldn’t create the follow-up reminder"),
    },
  });

  const updateFollowUp = useUpdateConversationFollowUp({
    mutation: {
      onSuccess: (followUp) => {
        toast.success(
          followUp.status === "DONE"
            ? "Follow-up completed"
            : "Follow-up cancelled",
        );
        refreshConversation();
      },
      onError: () => toast.error("Couldn’t update the follow-up reminder"),
    },
  });

  const createMeeting = useCreateConversationMeeting({
    mutation: {
      onSuccess: () => {
        setMeetingOpen(false);
        setMeetingDraft((current) => ({
          ...current,
          scheduledFor: defaultLocalDateTime(24 * 60),
          durationMinutes: "30",
          notes: "",
        }));
        toast.success("Internal meeting proposal recorded");
        refreshConversation();
      },
      onError: () => toast.error("Couldn’t record the meeting proposal"),
    },
  });

  const updateMeeting = useUpdateConversationMeeting({
    mutation: {
      onSuccess: () => {
        setMeetingToEdit(null);
        toast.success("Meeting details updated");
        refreshConversation();
      },
      onError: (error) => toast.error(decisionErrorMessage(error)),
    },
  });

  const confirmMeeting = useConfirmConversationMeeting({
    mutation: {
      onSuccess: () => {
        toast.success("Meeting confirmed in the internal ledger");
        refreshConversation();
      },
      onError: (error) => toast.error(decisionErrorMessage(error)),
    },
  });

  const cancelMeeting = useCancelConversationMeeting({
    mutation: {
      onSuccess: () => {
        setMeetingToCancel(null);
        setCancellationReason("");
        toast.success("Meeting cancelled");
        refreshConversation();
      },
      onError: (error) => toast.error(decisionErrorMessage(error)),
    },
  });

  const completeMeeting = useCompleteConversationMeeting({
    mutation: {
      onSuccess: () => {
        setTerminalMeetingAction(null);
        toast.success("Meeting marked completed");
        refreshConversation();
      },
      onError: (error) => toast.error(decisionErrorMessage(error)),
    },
  });

  const markMeetingNoShow = useMarkConversationMeetingNoShow({
    mutation: {
      onSuccess: () => {
        setTerminalMeetingAction(null);
        toast.success("Meeting marked no-show");
        refreshConversation();
      },
      onError: (error) => toast.error(decisionErrorMessage(error)),
    },
  });

  const meetingMutationPending =
    updateMeeting.isPending ||
    confirmMeeting.isPending ||
    cancelMeeting.isPending ||
    completeMeeting.isPending ||
    markMeetingNoShow.isPending;

  const submitReply = () => {
    if (conversation.archived) {
      toast.error("Restore this conversation before writing another reply");
      return;
    }
    const subject = replyDraft.subject.trim();
    const body = replyDraft.body.trim();
    if (!subject || !body) {
      toast.error("Add a subject and reply before saving the draft");
      return;
    }
    createReply.mutate({
      id: conversation.id,
      data: { subject, body },
    });
  };

  const submitFollowUp = () => {
    const dueAt = futureLocalDateTimeToIso(followUpDraft.dueAt);
    if (!dueAt.ok) {
      toast.error("Choose a future date and time for the follow-up");
      return;
    }
    createFollowUp.mutate({
      id: conversation.id,
      data: { dueAt: dueAt.iso, note: optionalText(followUpDraft.note) },
    });
  };

  const submitMeeting = () => {
    const scheduledFor = futureLocalDateTimeToIso(meetingDraft.scheduledFor);
    const durationMinutes = Number(meetingDraft.durationMinutes);
    if (!scheduledFor.ok) {
      toast.error("Choose a future date and time for the meeting");
      return;
    }
    if (
      !Number.isInteger(durationMinutes) ||
      durationMinutes < 1 ||
      durationMinutes > 1440
    ) {
      toast.error("Meeting duration must be between 1 and 1,440 minutes");
      return;
    }
    createMeeting.mutate({
      id: conversation.id,
      data: {
        title: optionalText(meetingDraft.title),
        scheduledFor: scheduledFor.iso,
        durationMinutes,
        notes: optionalText(meetingDraft.notes),
      },
    });
  };

  const openMeetingEdit = (meeting: ConversationMeeting) => {
    setMeetingEditDraft(meetingDraftFrom(meeting));
    setMeetingToEdit(meeting);
  };

  const submitMeetingEdit = () => {
    if (!meetingToEdit) return;
    const title = meetingEditDraft.title.trim();
    const scheduledFor = localDateTimeToIso(meetingEditDraft.scheduledFor);
    const durationMinutes = Number(meetingEditDraft.durationMinutes);
    if (!title) {
      toast.error("Add a title for the meeting");
      return;
    }
    if (!scheduledFor) {
      toast.error("Choose a valid date and time for the meeting");
      return;
    }
    if (
      !Number.isInteger(durationMinutes) ||
      durationMinutes < 1 ||
      durationMinutes > 1440
    ) {
      toast.error("Meeting duration must be between 1 and 1,440 minutes");
      return;
    }
    updateMeeting.mutate({
      meetingId: meetingToEdit.id,
      data: {
        title,
        scheduledFor,
        durationMinutes,
        notes: optionalText(meetingEditDraft.notes) ?? null,
      },
    });
  };

  const submitMeetingCancellation = () => {
    if (!meetingToCancel) return;
    cancelMeeting.mutate({
      meetingId: meetingToCancel.id,
      data: { reason: optionalText(cancellationReason) },
    });
  };

  const submitTerminalMeetingAction = () => {
    if (!terminalMeetingAction) return;
    if (terminalMeetingAction.outcome === "complete") {
      completeMeeting.mutate({ meetingId: terminalMeetingAction.meeting.id });
      return;
    }
    markMeetingNoShow.mutate({
      meetingId: terminalMeetingAction.meeting.id,
    });
  };

  return (
    <>
      <div className={cn("space-y-4", className)}>
        {pendingDraftId && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-medium text-amber-900">
              A reply artifact is already in progress
            </p>
            <p className="mt-1 text-xs text-amber-700">
              Open it to see its current review and send status.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 border-amber-300 bg-white"
              onClick={() => navigate(`/outbound/${pendingDraftId}`)}
            >
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open artifact
            </Button>
          </div>
        )}

        {conversation.archived && (
          <p
            className="rounded-lg border border-paper-200 bg-paper-100 p-3 text-xs text-ink-600"
            role="status"
          >
            Restore this conversation before writing another reply. Archiving
            stops any reply that had not started provider delivery.
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          {showArchiveControl && conversation.archived ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => unarchive.mutate({ id: conversation.id })}
              disabled={unarchive.isPending}
            >
              <ArchiveRestore className="mr-1.5 h-3.5 w-3.5" />
              {unarchive.isPending ? "Restoring…" : "Restore"}
            </Button>
          ) : showArchiveControl ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => archive.mutate({ id: conversation.id })}
              disabled={archive.isPending}
            >
              <Archive className="mr-1.5 h-3.5 w-3.5" />
              {archive.isPending ? "Archiving…" : "Archive"}
            </Button>
          ) : null}
          {conversation.unread && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => markRead.mutate({ id: conversation.id })}
              disabled={markRead.isPending}
            >
              <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
              {markRead.isPending ? "Marking…" : "Mark read"}
            </Button>
          )}
          {!pendingDraftId && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="conversation-write-draft"
              onClick={() => setReplyOpen(true)}
              disabled={conversation.archived}
              title={
                conversation.archived
                  ? "Restore this conversation before writing a reply"
                  : undefined
              }
            >
              <PenLine className="mr-1.5 h-3.5 w-3.5" /> Write draft
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setFollowUpOpen(true)}
          >
            <Clock3 className="mr-1.5 h-3.5 w-3.5" /> Follow-up
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setMeetingOpen(true)}
          >
            <CalendarPlus className="mr-1.5 h-3.5 w-3.5" /> Meeting
          </Button>
        </div>

        {followUps.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
              Follow-ups
            </p>
            <div className="space-y-2">
              {followUps.map((followUp) => (
                <div
                  key={followUp.id}
                  className="rounded-lg border border-paper-200 bg-paper-50 p-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-ink-800">
                        {format(new Date(followUp.dueAt), "MMM d, h:mm a")}
                      </p>
                      {followUp.note && (
                        <p className="mt-1 text-xs text-ink-500">
                          {followUp.note}
                        </p>
                      )}
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {followUp.status.toLowerCase()}
                    </Badge>
                  </div>
                  {followUp.status === "OPEN" && (
                    <div className="mt-2 flex gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        disabled={updateFollowUp.isPending}
                        onClick={() =>
                          updateFollowUp.mutate({
                            id: conversation.id,
                            followUpId: followUp.id,
                            data: { status: "DONE" },
                          })
                        }
                      >
                        <Check className="mr-1 h-3 w-3" /> Done
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-ink-500"
                        disabled={updateFollowUp.isPending}
                        onClick={() =>
                          updateFollowUp.mutate({
                            id: conversation.id,
                            followUpId: followUp.id,
                            data: { status: "CANCELLED" },
                          })
                        }
                      >
                        <X className="mr-1 h-3 w-3" /> Cancel
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {meetings.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
              Meetings
            </p>
            <div className="space-y-2">
              {meetings.map((meeting) => (
                <div
                  key={meeting.id}
                  className="rounded-lg border border-paper-200 bg-paper-50 p-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-ink-800">
                        {meeting.title}
                      </p>
                      <p className="mt-1 text-xs text-ink-500">
                        {format(
                          new Date(meeting.scheduledFor),
                          "MMM d, h:mm a",
                        )}{" "}
                        · {meeting.durationMinutes} min
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {meeting.status.toLowerCase().replace("_", "-")}
                    </Badge>
                  </div>
                  {(meeting.status === "PROPOSED" ||
                    meeting.status === "CONFIRMED") && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        data-testid={`meeting-edit-${meeting.id}`}
                        disabled={meetingMutationPending}
                        onClick={() => openMeetingEdit(meeting)}
                      >
                        Edit
                      </Button>
                      {meeting.status === "PROPOSED" && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          data-testid={`meeting-confirm-${meeting.id}`}
                          disabled={meetingMutationPending}
                          onClick={() =>
                            confirmMeeting.mutate({ meetingId: meeting.id })
                          }
                        >
                          Confirm
                        </Button>
                      )}
                      {meeting.status === "CONFIRMED" && (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            data-testid={`meeting-complete-${meeting.id}`}
                            disabled={meetingMutationPending}
                            onClick={() =>
                              setTerminalMeetingAction({
                                meeting,
                                outcome: "complete",
                              })
                            }
                          >
                            Complete
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-ink-500"
                            data-testid={`meeting-no-show-${meeting.id}`}
                            disabled={meetingMutationPending}
                            onClick={() =>
                              setTerminalMeetingAction({
                                meeting,
                                outcome: "no-show",
                              })
                            }
                          >
                            No-show
                          </Button>
                        </>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-ink-500"
                        data-testid={`meeting-cancel-${meeting.id}`}
                        disabled={meetingMutationPending}
                        onClick={() => {
                          setCancellationReason("");
                          setMeetingToCancel(meeting);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Dialog open={replyOpen} onOpenChange={setReplyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">Write reply draft</DialogTitle>
            <DialogDescription>
              Write or edit the reply here, then save it for human review. This
              does not send an email.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="conversation-reply-subject">Subject</Label>
              <Input
                id="conversation-reply-subject"
                className="mt-1.5"
                maxLength={200}
                value={replyDraft.subject}
                onChange={(event) =>
                  setReplyDraft((current) => ({
                    ...current,
                    subject: event.target.value,
                  }))
                }
              />
            </div>
            <div>
              <Label htmlFor="conversation-reply-body">Reply</Label>
              <Textarea
                id="conversation-reply-body"
                className="mt-1.5 min-h-40"
                maxLength={8000}
                placeholder="Write the reply you want a reviewer to approve…"
                value={replyDraft.body}
                onChange={(event) =>
                  setReplyDraft((current) => ({
                    ...current,
                    body: event.target.value,
                  }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReplyOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submitReply}
              disabled={createReply.isPending || !replyDraft.body.trim()}
            >
              {createReply.isPending ? "Saving…" : "Save for review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={followUpOpen} onOpenChange={setFollowUpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">Add follow-up</DialogTitle>
            <DialogDescription>
              Create an internal reminder. It will not send anything to the
              contact.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="conversation-follow-up-due">Due</Label>
              <Input
                id="conversation-follow-up-due"
                type="datetime-local"
                className="mt-1.5"
                value={followUpDraft.dueAt}
                onChange={(event) =>
                  setFollowUpDraft((current) => ({
                    ...current,
                    dueAt: event.target.value,
                  }))
                }
              />
            </div>
            <div>
              <Label htmlFor="conversation-follow-up-note">Note</Label>
              <Textarea
                id="conversation-follow-up-note"
                className="mt-1.5"
                maxLength={2000}
                placeholder="What should you remember?"
                value={followUpDraft.note}
                onChange={(event) =>
                  setFollowUpDraft((current) => ({
                    ...current,
                    note: event.target.value,
                  }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFollowUpOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submitFollowUp}
              disabled={createFollowUp.isPending}
            >
              {createFollowUp.isPending ? "Creating…" : "Create reminder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={meetingOpen} onOpenChange={setMeetingOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">
              Record meeting proposal
            </DialogTitle>
            <DialogDescription>
              This is an internal ledger entry only. It does not create a
              calendar event or send an invite.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="conversation-meeting-title">Title</Label>
              <Input
                id="conversation-meeting-title"
                className="mt-1.5"
                maxLength={200}
                value={meetingDraft.title}
                onChange={(event) =>
                  setMeetingDraft((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="conversation-meeting-time">Date and time</Label>
                <Input
                  id="conversation-meeting-time"
                  type="datetime-local"
                  className="mt-1.5"
                  value={meetingDraft.scheduledFor}
                  onChange={(event) =>
                    setMeetingDraft((current) => ({
                      ...current,
                      scheduledFor: event.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="conversation-meeting-duration">
                  Duration (minutes)
                </Label>
                <Input
                  id="conversation-meeting-duration"
                  type="number"
                  min={1}
                  max={1440}
                  className="mt-1.5"
                  value={meetingDraft.durationMinutes}
                  onChange={(event) =>
                    setMeetingDraft((current) => ({
                      ...current,
                      durationMinutes: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div>
              <Label htmlFor="conversation-meeting-notes">Notes</Label>
              <Textarea
                id="conversation-meeting-notes"
                className="mt-1.5"
                maxLength={2000}
                placeholder="Agenda or internal context"
                value={meetingDraft.notes}
                onChange={(event) =>
                  setMeetingDraft((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMeetingOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitMeeting} disabled={createMeeting.isPending}>
              {createMeeting.isPending ? "Recording…" : "Record proposal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={meetingToEdit !== null}
        onOpenChange={(open) => {
          if (!open && !updateMeeting.isPending) setMeetingToEdit(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">Edit meeting</DialogTitle>
            <DialogDescription>
              Update the internal ledger entry. This does not change an external
              calendar event or send an invite.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="conversation-meeting-edit-title">Title</Label>
              <Input
                id="conversation-meeting-edit-title"
                className="mt-1.5"
                maxLength={200}
                value={meetingEditDraft.title}
                onChange={(event) =>
                  setMeetingEditDraft((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="conversation-meeting-edit-time">
                  Date and time
                </Label>
                <Input
                  id="conversation-meeting-edit-time"
                  type="datetime-local"
                  className="mt-1.5"
                  value={meetingEditDraft.scheduledFor}
                  onChange={(event) =>
                    setMeetingEditDraft((current) => ({
                      ...current,
                      scheduledFor: event.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="conversation-meeting-edit-duration">
                  Duration (minutes)
                </Label>
                <Input
                  id="conversation-meeting-edit-duration"
                  type="number"
                  min={1}
                  max={1440}
                  className="mt-1.5"
                  value={meetingEditDraft.durationMinutes}
                  onChange={(event) =>
                    setMeetingEditDraft((current) => ({
                      ...current,
                      durationMinutes: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div>
              <Label htmlFor="conversation-meeting-edit-notes">Notes</Label>
              <Textarea
                id="conversation-meeting-edit-notes"
                className="mt-1.5"
                maxLength={2000}
                value={meetingEditDraft.notes}
                onChange={(event) =>
                  setMeetingEditDraft((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMeetingToEdit(null)}
              disabled={updateMeeting.isPending}
            >
              Keep unchanged
            </Button>
            <Button
              onClick={submitMeetingEdit}
              disabled={updateMeeting.isPending}
            >
              {updateMeeting.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={meetingToCancel !== null}
        onOpenChange={(open) => {
          if (!open && !cancelMeeting.isPending) {
            setMeetingToCancel(null);
            setCancellationReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">Cancel meeting</DialogTitle>
            <DialogDescription>
              This closes the meeting in the internal ledger. It does not cancel
              an external calendar event or notify attendees.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="conversation-meeting-cancel-reason">
              Reason (optional)
            </Label>
            <Textarea
              id="conversation-meeting-cancel-reason"
              className="mt-1.5"
              maxLength={2000}
              placeholder="Why was this meeting cancelled?"
              value={cancellationReason}
              onChange={(event) => setCancellationReason(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMeetingToCancel(null)}
              disabled={cancelMeeting.isPending}
            >
              Keep meeting
            </Button>
            <Button
              variant="destructive"
              onClick={submitMeetingCancellation}
              disabled={cancelMeeting.isPending}
            >
              {cancelMeeting.isPending ? "Cancelling…" : "Cancel meeting"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={terminalMeetingAction !== null}
        onOpenChange={(open) => {
          if (
            !open &&
            !completeMeeting.isPending &&
            !markMeetingNoShow.isPending
          ) {
            setTerminalMeetingAction(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">
              Mark meeting{" "}
              {terminalMeetingAction?.outcome === "no-show"
                ? "no-show"
                : "completed"}
              ?
            </DialogTitle>
            <DialogDescription>
              This records a final outcome in the internal ledger. It does not
              update an external calendar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setTerminalMeetingAction(null)}
              disabled={
                completeMeeting.isPending || markMeetingNoShow.isPending
              }
            >
              Go back
            </Button>
            <Button
              onClick={submitTerminalMeetingAction}
              disabled={
                completeMeeting.isPending || markMeetingNoShow.isPending
              }
            >
              {completeMeeting.isPending || markMeetingNoShow.isPending
                ? "Saving…"
                : terminalMeetingAction?.outcome === "no-show"
                  ? "Mark no-show"
                  : "Mark completed"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
