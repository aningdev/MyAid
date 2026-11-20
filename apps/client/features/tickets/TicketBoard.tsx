/**
 * The Tickets board: the Owner's inbox for every pending Attention, and one
 * Ticket's process. It is not part of a Bot's Dialogue — it covers the
 * Workbench, lists what waits on this Device, and opens a Ticket's own
 * Session for reading and replies. A Ticket's Session is not claimed as a
 * segment of the Bot.
 */
import { ChevronLeft, ChevronRight, CircleHelp, ShieldCheck, X } from "lucide";
import { cleanup, effect, keymap, Scroll, signal, Text, token, View } from "nsh";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { emptyLook } from "../../components/ui/empty";
import { Input } from "../../components/ui/input";
import { Pressable } from "../../components/ui/pressable";
import { Radio, RadioGroup } from "../../components/ui/radio-group";
import type {
  Attention,
  AttentionQuestion,
  QuestionAnswer,
  Ticket,
} from "../../lib/dsh/tickets-gateway";
import { t } from "../../lib/i18n";
import { Icon } from "../../lib/icons";
import { listRow, sectionSurface } from "../../lib/surface";
import { mono } from "../../lib/theme";
import { registry } from "../bots/state";
import { ChatPane } from "../dialogue/ChatPane";
import { controllerFor } from "../dialogue/session/runtime";
import { backToAttentionInbox, closeTicketBoard, openTicket, ticketBoard } from "./board";
import {
  attentionKindLabel,
  ticketSourceLabel,
  ticketStatusLabel,
  ticketStatusTone,
  ticketTime,
} from "./model";
import {
  answerAttention,
  cancelTicket,
  pendingAttentions,
  pendingAttentionsFor,
  ticketById,
  ticketsActionError,
  ticketsLoadError,
  ticketsSaving,
  ticketsSnapshot,
} from "./state";

export function TicketBoard() {
  effect(() => {
    if (!ticketBoard()) return;
    const off = keymap.bind(
      "escape",
      () => {
        const view = ticketBoard();
        if (view?.mode === "ticket" && view.fromInbox) backToAttentionInbox();
        else closeTicketBoard();
      },
      { when: "always" },
    );
    cleanup(off);
  });

  const view = () => ticketBoard();
  return (
    <If when={view()}>
      <View
        testID="ticket-board"
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          backgroundColor: token("background"),
        }}
      >
        <Header />
        <If when={view()?.mode === "inbox"} else={<TicketDetail />}>
          <Inbox />
        </If>
      </View>
    </If>
  );
}

function Header() {
  const view = () => ticketBoard();
  const fromInbox = () => {
    const current = view();
    return current?.mode === "ticket" && current.fromInbox;
  };
  const ticket = () => {
    const current = view();
    return current?.mode === "ticket" ? ticketById(current.ticketId) : undefined;
  };
  return (
    <View
      style={{
        height: 44,
        flexShrink: 0,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 10,
        borderBottomWidth: 1,
        borderBottomColor: token("line"),
      }}
    >
      <If when={fromInbox()}>
        <Pressable
          accessibilityLabel={t("tickets.back")}
          onPress={backToAttentionInbox}
          style={{ flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44 }}
        >
          <Icon icon={ChevronLeft} size={14} tint={token("muted-foreground")} />
          <Text style={{ fontSize: 13, color: token("muted-foreground") }}>
            {t("attention.title")}
          </Text>
        </Pressable>
      </If>
      <Text
        style={{
          flex: 1,
          fontSize: 15,
          fontWeight: "600",
          color: token("foreground"),
          numberOfLines: 1,
        }}
      >
        {view()?.mode === "ticket" ? (ticket()?.title ?? t("tickets.title")) : t("attention.title")}
      </Text>
      <If when={view()?.mode === "inbox"}>
        <Badge tone={() => (pendingAttentions().length > 0 ? "warn" : "neutral")}>
          {String(pendingAttentions().length)}
        </Badge>
      </If>
      <Button
        variant="ghost"
        size="sm"
        accessibilityLabel={t("tickets.close")}
        onPress={closeTicketBoard}
      >
        <Icon icon={X} size={14} tint={token("muted-foreground")} />
      </Button>
    </View>
  );
}

function Inbox() {
  return (
    <Scroll style={{ flex: 1 }} contentStyle={{ padding: 12, gap: 8 }}>
      <If when={ticketsLoadError()} else={null}>
        <Text style={{ fontSize: 12, color: token("destructive") }}>{ticketsLoadError()}</Text>
      </If>
      <If when={pendingAttentions().length === 0} else={null}>
        <View style={{ flexGrow: 1, paddingVertical: 32, ...emptyLook().root() }}>
          <View style={{ ...emptyLook().media("icon") }}>
            <Icon icon={CircleHelp} size={24} tint={token("muted-foreground")} />
          </View>
          <Text style={emptyLook().title()}>{t("attention.emptyTitle")}</Text>
          <Text style={emptyLook().description()}>{t("attention.emptyNote")}</Text>
        </View>
      </If>
      <Each of={pendingAttentions()} key={(attention) => attention.id}>
        {(attention) => <InboxRow attention={attention} />}
      </Each>
    </Scroll>
  );
}

function InboxRow(props: { attention: () => Attention }) {
  const attention = () => props.attention();
  const ticket = () => ticketById(attention().ticketId);
  const botName = () => {
    const id = ticket()?.botId;
    return registry().bots.find((bot) => bot.id === id)?.name ?? t("tickets.unknownBot");
  };
  return (
    <Pressable
      testID={`attention-${attention().id}`}
      accessibilityLabel={attention().prompt}
      onPress={() => openTicket(attention().ticketId, { fromInbox: true })}
      style={{
        ...sectionSurface({ padded: true }),
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
      }}
      hoverStyle={{ backgroundColor: token("accent") }}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: token("muted"),
        }}
      >
        <Icon
          icon={attention().kind === "approval" ? ShieldCheck : CircleHelp}
          size={15}
          tint={token("muted-foreground")}
        />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Badge tone={attention().kind === "approval" ? "warn" : "neutral"}>
            {attentionKindLabel(attention().kind)}
          </Badge>
          <Text style={{ fontSize: 11, color: token("muted-foreground"), numberOfLines: 1 }}>
            {t("attention.fromBot", { bot: botName() })}
          </Text>
        </View>
        <Text
          style={{
            fontSize: 13,
            fontWeight: "500",
            color: token("foreground"),
            numberOfLines: 2,
          }}
        >
          {attention().prompt}
        </Text>
        <Text style={{ fontSize: 11, color: token("muted-foreground"), numberOfLines: 1 }}>
          {ticket()?.title ?? t("tickets.gone")} · {ticketTime(attention().createdAt, Date.now())}
        </Text>
      </View>
      <Icon icon={ChevronRight} size={14} tint={token("muted-foreground")} />
    </Pressable>
  );
}

function TicketDetail() {
  const ticketId = () => {
    const view = ticketBoard();
    return view?.mode === "ticket" ? view.ticketId : "";
  };
  const ticket = () => ticketById(ticketId());
  return (
    <If
      when={ticket()}
      else={
        <View style={{ padding: 16 }}>
          <Text style={{ fontSize: 13, color: token("muted-foreground") }}>
            {t("tickets.gone")}
          </Text>
        </View>
      }
    >
      <TicketBody ticket={ticket} />
    </If>
  );
}

function TicketBody(props: { ticket: () => Ticket | undefined }) {
  const ticket = () => props.ticket();
  const sessionId = () => ticket()?.sessionId ?? null;
  const live = () => ticket()?.status === "open" || ticket()?.status === "waiting";
  const waiting = () => pendingAttentionsFor(ticket()!.id);
  const botName = () =>
    registry().bots.find((bot) => bot.id === ticket()!.botId)?.name ?? t("tickets.unknownBot");
  return (
    <View style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
      <Scroll
        style={{
          flexShrink: 1,
          flexGrow: sessionId() ? 0 : 1,
          maxHeight: sessionId() ? "56%" : undefined,
        }}
        contentStyle={{ padding: 12, gap: 12 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Badge tone={ticketStatusTone(ticket()!.status)}>
            {ticketStatusLabel(ticket()!.status)}
          </Badge>
          <Text style={{ fontSize: 12, color: token("muted-foreground") }}>{botName()}</Text>
          <If when={ticketSourceLabel(ticket()!, ticketsSnapshot().sources)} else={null}>
            <Text style={{ fontSize: 12, color: token("muted-foreground") }}>
              {ticketSourceLabel(ticket()!, ticketsSnapshot().sources)}
            </Text>
          </If>
          <Text style={{ fontSize: 12, color: token("muted-foreground") }}>
            {t("tickets.updated", { time: ticketTime(ticket()!.updatedAt, Date.now()) })}
          </Text>
        </View>
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: token("muted-foreground") }}>
            {t("tickets.request")}
          </Text>
          <Text style={{ fontSize: 13, color: token("foreground") }}>{ticket()!.request}</Text>
        </View>
        <If when={ticketsActionError()} else={null}>
          <Text style={{ fontSize: 12, color: token("destructive") }}>{ticketsActionError()}</Text>
        </If>
        <Each of={waiting()} key={(attention) => attention.id}>
          {(attention) => <AttentionCard attention={attention} />}
        </Each>
        <If when={ticket()!.result !== null} else={null}>
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: token("muted-foreground") }}>
              {t("tickets.result")}
            </Text>
            <Text style={{ fontSize: 13, color: token("foreground") }}>{ticket()!.result}</Text>
          </View>
        </If>
        <If when={ticket()!.error !== null} else={null}>
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: token("destructive") }}>
              {t("tickets.error")}
            </Text>
            <Text style={{ fontSize: 13, color: token("destructive") }}>{ticket()!.error}</Text>
          </View>
        </If>
        <If when={live()}>
          <CancelTicket ticket={() => ticket()!} />
        </If>
      </Scroll>
      <If when={sessionId()} else={null}>
        <View
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            borderTopWidth: 1,
            borderTopColor: token("line"),
          }}
        >
          <View style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: token("muted-foreground") }}>
              {t("tickets.session")}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 0, minHeight: 0 }} testID="ticket-session">
            <ChatPane controller={controllerFor(sessionId()!)} />
          </View>
        </View>
      </If>
    </View>
  );
}

function AttentionCard(props: { attention: () => Attention }) {
  const attention = () => props.attention();
  return (
    <View
      testID={`ticket-attention-${attention().id}`}
      style={{ ...sectionSurface({ padded: true }), gap: 10 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Badge tone={attention().kind === "approval" ? "warn" : "neutral"}>
          {attentionKindLabel(attention().kind)}
        </Badge>
        <Text style={{ fontSize: 11, color: token("muted-foreground") }}>
          {ticketTime(attention().createdAt, Date.now())}
        </Text>
      </View>
      <Text style={{ fontSize: 13, fontWeight: "500", color: token("foreground") }}>
        {attention().prompt}
      </Text>
      <If when={attention().kind === "approval"} else={<QuestionForm attention={attention} />}>
        <ApprovalForm attention={attention} />
      </If>
    </View>
  );
}

function ApprovalForm(props: { attention: () => Attention }) {
  const attention = () => props.attention();
  const approval = () => attention().approval;
  return (
    <View style={{ gap: 8 }}>
      <If when={approval()} else={null}>
        <View style={{ gap: 2 }}>
          <Text style={{ fontSize: 12, color: token("foreground"), fontFamily: mono }}>
            {approval()?.toolName}
          </Text>
          <If when={approval()?.reason} else={null}>
            <Text style={{ fontSize: 12, color: token("muted-foreground") }}>
              {approval()?.reason}
            </Text>
          </If>
        </View>
      </If>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Button
          size="sm"
          busy={ticketsSaving()}
          onPress={() =>
            void answerAttention(attention().id, { kind: "approval", decision: "allow" })
          }
        >
          {t("attention.allow")}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          disabled={ticketsSaving()}
          onPress={() =>
            void answerAttention(attention().id, { kind: "approval", decision: "reject" })
          }
        >
          {t("attention.reject")}
        </Button>
      </View>
    </View>
  );
}

type Draft = Record<string, { selected: string[]; custom: string }>;

function seed(questions: AttentionQuestion[]): Draft {
  const draft: Draft = {};
  for (const question of questions) draft[question.id] = { selected: [], custom: "" };
  return draft;
}

function QuestionForm(props: { attention: () => Attention }) {
  const attention = () => props.attention();
  const questions = () => attention().questions;
  const draft = signal<Draft>(seed(questions()));
  const incomplete = () =>
    questions().some((question) => {
      const entry = draft()[question.id];
      return !entry || (entry.selected.length === 0 && entry.custom.trim() === "");
    });
  const setSelected = (questionId: string, selected: string[]): void => {
    draft.update((current) => ({
      ...current,
      [questionId]: { ...current[questionId]!, selected },
    }));
  };
  const setCustom = (questionId: string, custom: string): void => {
    draft.update((current) => ({
      ...current,
      [questionId]: { ...current[questionId]!, custom },
    }));
  };
  const submit = (): void => {
    if (incomplete() || ticketsSaving()) return;
    const answers: QuestionAnswer[] = questions().map((question) => {
      const entry = draft()[question.id]!;
      const custom = entry.custom.trim();
      return {
        questionId: question.id,
        selected: entry.selected,
        ...(custom ? { custom } : {}),
      };
    });
    void answerAttention(attention().id, { kind: "question", answers });
  };
  return (
    <View style={{ gap: 10 }}>
      <Each of={questions()} key={(question) => question.id}>
        {(question) => (
          <View style={{ gap: 6 }}>
            <View style={{ gap: 2 }}>
              <If when={question().header} else={null}>
                <Text style={{ fontSize: 11, fontWeight: "600", color: token("muted-foreground") }}>
                  {question().header}
                </Text>
              </If>
              <Text style={{ fontSize: 13, color: token("foreground") }}>
                {question().question}
              </Text>
              <Text style={{ fontSize: 11, color: token("muted-foreground") }}>
                {question().multiSelect ? t("attention.selectMany") : t("attention.selectOne")}
              </Text>
            </View>
            <If when={question().options} else={null}>
              <If
                when={question().multiSelect}
                else={
                  <RadioGroup accessibilityLabel={question().question}>
                    <Each of={question().options ?? []} key={(option) => option.label}>
                      {(option) => (
                        <Radio
                          {...listRow({ first: true })}
                          checked={(draft()[question().id]?.selected ?? []).includes(
                            option().label,
                          )}
                          accessibilityLabel={option().label}
                          onChange={() => setSelected(question().id, [option().label])}
                        >
                          <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                            <Text style={{ fontSize: 13, color: token("foreground") }}>
                              {option().label}
                            </Text>
                            <If when={option().description} else={null}>
                              <Text style={{ fontSize: 11, color: token("muted-foreground") }}>
                                {option().description}
                              </Text>
                            </If>
                          </View>
                        </Radio>
                      )}
                    </Each>
                  </RadioGroup>
                }
              >
                <Each of={question().options ?? []} key={(option) => option.label}>
                  {(option) => (
                    <Checkbox
                      {...listRow({ first: true })}
                      checked={(draft()[question().id]?.selected ?? []).includes(option().label)}
                      accessibilityLabel={option().label}
                      onChange={() => {
                        const selected = draft()[question().id]?.selected ?? [];
                        setSelected(
                          question().id,
                          selected.includes(option().label)
                            ? selected.filter((label) => label !== option().label)
                            : [...selected, option().label],
                        );
                      }}
                    >
                      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                        <Text style={{ fontSize: 13, color: token("foreground") }}>
                          {option().label}
                        </Text>
                        <If when={option().description} else={null}>
                          <Text style={{ fontSize: 11, color: token("muted-foreground") }}>
                            {option().description}
                          </Text>
                        </If>
                      </View>
                    </Checkbox>
                  )}
                </Each>
              </If>
            </If>
            <Input
              accessibilityLabel={t("attention.customLabel")}
              placeholder={t("attention.customPlaceholder")}
              value={draft()[question().id]?.custom ?? ""}
              onChange={(event) => setCustom(question().id, event.value)}
            />
          </View>
        )}
      </Each>
      <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
        <Button size="sm" disabled={incomplete()} busy={ticketsSaving()} onPress={submit}>
          {t("attention.answer")}
        </Button>
      </View>
    </View>
  );
}

function CancelTicket(props: { ticket: () => Ticket }) {
  const ticket = () => props.ticket();
  const confirming = signal(false);
  return (
    <View style={{ flexDirection: "row" }}>
      <Button
        testID="ticket-cancel"
        variant="destructive"
        size="sm"
        busy={ticketsSaving()}
        onPress={() => confirming.set(true)}
      >
        {t("tickets.cancel")}
      </Button>
      <AlertDialog
        open={confirming()}
        onOpenChange={(event) => confirming.set(event.open)}
        onAction={(event) => {
          if (event.action === "cancel-ticket") void cancelTicket(ticket().id);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>{t("tickets.cancelTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("tickets.cancelNote", { title: ticket().title })}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction id="cancel-ticket" role="destructive">
              {t("tickets.cancel")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </View>
  );
}
