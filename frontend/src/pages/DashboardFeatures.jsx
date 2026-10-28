import { useCallback, useEffect, useMemo, useState } from "react";
import { FiAward, FiMessageSquare, FiSearch, FiSend, FiStar } from "react-icons/fi";
import api from "../services/api";

function requestMessage(error, fallback) {
  const detail = error.response?.data?.detail;
  if (detail) return detail;
  const data = error.response?.data;
  if (data && typeof data === "object") {
    return Object.entries(data)
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(" ") : value}`)
      .join(" ");
  }
  return fallback;
}

function displayDate(value) {
  return value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
    : "";
}

export function MessagesPanel({ role, onUnreadChange }) {
  const [conversations, setConversations] = useState([]);
  const [recipients, setRecipients] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [threadMessages, setThreadMessages] = useState([]);
  const [recipientIds, setRecipientIds] = useState([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [reply, setReply] = useState("");
  const [search, setSearch] = useState("");
  const [recipientSearch, setRecipientSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [composing, setComposing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const refreshConversations = useCallback(async () => {
    const [conversationResponse, countResponse] = await Promise.all([
      api.get("messages/conversations/", { params: { search, role: roleFilter } }),
      api.get("messages/unread-count/"),
    ]);
    setConversations(conversationResponse.data);
    onUnreadChange?.(countResponse.data.unread_count);
    return conversationResponse.data;
  }, [onUnreadChange, roleFilter, search]);

  useEffect(() => {
    let alive = true;
    const timeoutId = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const [conversationResponse, countResponse] = await Promise.all([
          api.get("messages/conversations/", { params: { search, role: roleFilter } }),
          api.get("messages/unread-count/"),
        ]);
        if (!alive) return;
        setConversations(conversationResponse.data);
        onUnreadChange?.(countResponse.data.unread_count);
      } catch (requestError) {
        if (alive) setError(requestMessage(requestError, "Messages could not be loaded."));
      } finally {
        if (alive) setLoading(false);
      }
    }, 180);
    return () => {
      alive = false;
      window.clearTimeout(timeoutId);
    };
  }, [onUnreadChange, roleFilter, search]);

  useEffect(() => {
    let alive = true;
    api.get("messages/recipients/")
      .then((response) => {
        if (alive) setRecipients(response.data);
      })
      .catch((requestError) => {
        if (alive) setError(requestMessage(requestError, "Permitted recipients could not be loaded."));
      });
    return () => { alive = false; };
  }, []);

  async function openConversation(conversation) {
    setError("");
    setComposing(false);
    setSelectedConversation(conversation);
    try {
      const response = await api.get(`messages/conversations/${conversation.id}/`);
      setThreadMessages(response.data);
      await refreshConversations();
    } catch (requestError) {
      setError(requestMessage(requestError, "This conversation could not be opened."));
    }
  }

  async function sendNewMessage(event) {
    event.preventDefault();
    if (!recipientIds.length) {
      setError("Choose at least one recipient.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await api.post("messages/send/", {
        recipient_ids: recipientIds.map(Number),
        subject,
        body,
      });
      setBody("");
      setSubject("");
      setRecipientIds([]);
      setComposing(false);
      const updatedConversations = await refreshConversations();
      if (response.data.length === 1) {
        const conversation = updatedConversations.find(
          (item) => item.id === response.data[0].conversation,
        );
        if (conversation) await openConversation(conversation);
      }
    } catch (requestError) {
      setError(requestMessage(requestError, "Your message could not be sent."));
    } finally {
      setSaving(false);
    }
  }

  async function sendReply(event) {
    event.preventDefault();
    if (!selectedConversation || !reply.trim()) return;
    setSaving(true);
    setError("");
    try {
      await api.post(`messages/conversations/${selectedConversation.id}/`, { body: reply });
      setReply("");
      const response = await api.get(`messages/conversations/${selectedConversation.id}/`);
      setThreadMessages(response.data);
      await refreshConversations();
    } catch (requestError) {
      setError(requestMessage(requestError, "Your reply could not be sent."));
    } finally {
      setSaving(false);
    }
  }

  const visibleConversations = conversations;
  const visibleRecipients = useMemo(
    () => recipients.filter((recipient) => recipient.name.toLowerCase().includes(
      recipientSearch.trim().toLowerCase(),
    )),
    [recipientSearch, recipients],
  );

  return (
    <section className="manager-panel feature-panel messages-panel">
      <div className="manager-panel-heading feature-panel-heading">
        <div>
          <span className="manager-panel-label">PRIVATE ACADEMY MESSAGING</span>
          <h2><FiMessageSquare aria-hidden="true" /> Messages</h2>
          <p>Send and read messages with people your role is allowed to contact.</p>
        </div>
        {role !== "student" && (
          <button
            className="manager-button manager-button-primary"
            type="button"
            onClick={() => {
              setSelectedConversation(null);
              setComposing(true);
              setError("");
            }}
          >
            <FiSend aria-hidden="true" /> New message
          </button>
        )}
      </div>

      {error && <p className="dashboard-feedback dashboard-error" role="alert">{error}</p>}

      <div className="message-workspace">
        <aside className="message-inbox">
          <div className="message-inbox-filters">
            <label className="manager-search">
              <FiSearch aria-hidden="true" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search messages"
                aria-label="Search messages"
              />
            </label>
            <select
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
              aria-label="Filter messages by role"
            >
              <option value="">All roles</option>
              {["manager", "hr", "trainer", "student"].map((option) => (
                <option key={option} value={option}>{option.toUpperCase()}</option>
              ))}
            </select>
          </div>
          {loading ? (
            <p className="feature-empty">Loading conversations…</p>
          ) : visibleConversations.length ? visibleConversations.map((conversation) => (
            <button
              type="button"
              className={`message-conversation${selectedConversation?.id === conversation.id ? " is-active" : ""}`}
              key={conversation.id}
              onClick={() => openConversation(conversation)}
            >
              <span className="message-conversation-meta">
                <strong>{conversation.participant_name}</strong>
                <small>{conversation.participant_role.toUpperCase()}</small>
              </span>
              <span className="message-conversation-subject">
                {conversation.latest_message.subject || conversation.latest_message.body}
              </span>
              <span className="message-conversation-footer">
                <small>{displayDate(conversation.updated_at)}</small>
                {conversation.unread_count > 0 && <b>{conversation.unread_count}</b>}
              </span>
            </button>
          )) : (
            <p className="feature-empty">No conversations yet. Your messages will appear here.</p>
          )}
        </aside>

        <div className="message-reading-pane">
          {composing ? (
            <form className="manager-form message-compose-form" onSubmit={sendNewMessage}>
              <h3>New message</h3>
              <fieldset className="message-recipient-picker">
                <legend>Recipients (up to 50)</legend>
                <label className="message-recipient-search">
                  <FiSearch aria-hidden="true" />
                  <input
                    value={recipientSearch}
                    onChange={(event) => setRecipientSearch(event.target.value)}
                    placeholder="Search recipients"
                    aria-label="Search permitted recipients"
                  />
                </label>
                {visibleRecipients.length ? visibleRecipients.map((recipient) => (
                  <label key={recipient.id}>
                    <input
                      type="checkbox"
                      checked={recipientIds.includes(String(recipient.id))}
                      disabled={
                        !recipientIds.includes(String(recipient.id)) &&
                        recipientIds.length >= 50
                      }
                      onChange={(event) => setRecipientIds((current) => (
                        event.target.checked
                          ? [...current, String(recipient.id)]
                          : current.filter((id) => id !== String(recipient.id))
                      ))}
                    />
                    {recipient.name} <small>{recipient.role.toUpperCase()}</small>
                  </label>
                )) : <span className="feature-empty">
                  {recipients.length ? "No recipients match your search." : "No permitted recipients are available."}
                </span>}
              </fieldset>
              <label>
                Subject
                <input
                  maxLength="180"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                />
              </label>
              <label>
                Message
                <textarea
                  required
                  maxLength="10000"
                  rows="5"
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                />
              </label>
              <button className="manager-button manager-button-primary" disabled={saving}>
                <FiSend aria-hidden="true" /> {saving ? "Sending…" : "Send message"}
              </button>
            </form>
          ) : selectedConversation ? (
            <>
              <header className="message-thread-heading">
                <div>
                  <h3>{selectedConversation.participant_name}</h3>
                  <span>{selectedConversation.participant_role.toUpperCase()}</span>
                </div>
              </header>
              <div className="message-thread">
                {threadMessages.map((item) => (
                  <article className={`message-bubble${item.is_mine ? " is-mine" : ""}`} key={item.id}>
                    <div><strong>{item.is_mine ? "You" : item.sender_name}</strong><time>{displayDate(item.created_at)}</time></div>
                    {item.subject && <h4>{item.subject}</h4>}
                    <p>{item.body}</p>
                    {item.is_mine && <small>{item.is_read ? "Read" : "Sent"}</small>}
                  </article>
                ))}
                {!threadMessages.length && <p className="feature-empty">No messages in this conversation.</p>}
              </div>
              <form className="message-reply-form" onSubmit={sendReply}>
                <textarea
                  required
                  maxLength="10000"
                  rows="3"
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  placeholder="Write a reply…"
                  aria-label="Write a reply"
                />
                <button className="manager-button manager-button-primary" disabled={saving}>
                  <FiSend aria-hidden="true" /> {saving ? "Sending…" : "Reply"}
                </button>
              </form>
            </>
          ) : (
            <div className="message-empty-state">
              <FiMessageSquare aria-hidden="true" />
              <h3>Select a conversation</h3>
              <p>Choose a message to read the conversation, or start a new one.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function StarRating({ value, onChange, label, readOnly = false }) {
  return (
    <div className="feedback-stars" role={readOnly ? "img" : "group"} aria-label={`${label}: ${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          className={star <= value ? "is-filled" : ""}
          type="button"
          disabled={readOnly}
          aria-label={`${star} ${star === 1 ? "star" : "stars"}`}
          onClick={() => onChange?.(star)}
        >
          <FiStar aria-hidden="true" />
        </button>
      ))}
      <span>{value}/5</span>
    </div>
  );
}

const ratingFields = [
  ["overall_rating", "Overall rating"],
  ["teaching_rating", "Teaching quality"],
  ["communication_rating", "Communication"],
  ["subject_knowledge_rating", "Subject knowledge"],
];

export function TrainerFeedbackPanel({ role }) {
  const isStudent = role === "student";
  const [options, setOptions] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [summary, setSummary] = useState(null);
  const [filters, setFilters] = useState({
    trainer: "",
    course: "",
    batch: "",
    rating: "",
    date_from: "",
    date_to: "",
  });
  const [selectedOption, setSelectedOption] = useState("");
  const [ratings, setRatings] = useState({
    overall_rating: 0,
    teaching_rating: 0,
    communication_rating: 0,
    subject_knowledge_rating: 0,
  });
  const [comments, setComments] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const filterParams = useMemo(
    () => Object.fromEntries(Object.entries(filters).filter(([, value]) => value)),
    [filters],
  );

  useEffect(() => {
    let alive = true;
    async function loadStudentFeedback() {
      setLoading(true);
      try {
        const [optionsResponse, feedbackResponse] = await Promise.all([
          api.get("trainer-feedback/options/"),
          api.get("trainer-feedback/"),
        ]);
        if (alive) {
          setOptions(optionsResponse.data);
          setFeedback(feedbackResponse.data);
        }
      } catch (requestError) {
        if (alive) setError(requestMessage(requestError, "Trainer feedback could not be loaded."));
      } finally {
        if (alive) setLoading(false);
      }
    }
    async function loadReport() {
      setLoading(true);
      setError("");
      try {
        const [feedbackResponse, summaryResponse] = await Promise.all([
          api.get("trainer-feedback/", { params: filterParams }),
          api.get("trainer-feedback/summary/", { params: filterParams }),
        ]);
        if (alive) {
          setError("");
          setFeedback(feedbackResponse.data);
          setSummary(summaryResponse.data);
        }
      } catch (requestError) {
        if (alive) setError(requestMessage(requestError, "Trainer feedback could not be loaded."));
      } finally {
        if (alive) setLoading(false);
      }
    }
    if (isStudent) loadStudentFeedback();
    else loadReport();
    return () => { alive = false; };
  }, [filterParams, isStudent]);

  async function submitFeedback(event) {
    event.preventDefault();
    const option = options.find((item) => `${item.trainer}:${item.batch}` === selectedOption);
    if (!option) {
      setError("Select one of your trainers and enrolled batches.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await api.post("trainer-feedback/", {
        trainer: option.trainer,
        course: option.course,
        batch: option.batch,
        ...ratings,
        comments,
      });
      const [optionsResponse, feedbackResponse] = await Promise.all([
        api.get("trainer-feedback/options/"),
        api.get("trainer-feedback/"),
      ]);
      setOptions(optionsResponse.data);
      setFeedback(feedbackResponse.data);
      setRatings({
        overall_rating: 0,
        teaching_rating: 0,
        communication_rating: 0,
        subject_knowledge_rating: 0,
      });
      setComments("");
      setSelectedOption("");
      setNotice("Thank you. Your trainer feedback has been submitted.");
    } catch (requestError) {
      setError(requestMessage(requestError, "Your feedback could not be submitted."));
    } finally {
      setSaving(false);
    }
  }

  const trainerOptions = summary?.available_filters?.trainers?.map((item) => ({
    id: item.trainer_id,
    name: item.trainer__full_name,
  })) || [];
  const courseOptions = summary?.available_filters?.courses?.map((item) => ({
    id: item.course_id,
    name: item.course__name,
  })) || [];
  const batchOptions = summary?.available_filters?.batches?.map((item) => ({
    id: item.batch_id,
    name: item.batch__name,
  })) || [];
  const availableOptions = options.filter((option) => !option.already_submitted);

  return (
    <section className="manager-panel feature-panel feedback-panel">
      <div className="manager-panel-heading feature-panel-heading">
        <div>
          <span className="manager-panel-label">{isStudent ? "YOUR TRAINING EXPERIENCE" : "STUDENT PERFORMANCE INPUT"}</span>
          <h2><FiAward aria-hidden="true" /> {isStudent ? "Trainer Feedback" : "Trainer Performance Feedback"}</h2>
          <p>
            {isStudent
              ? "Share constructive feedback about trainers connected to your enrolled courses."
              : "Feedback is performance input for review, not a verified misconduct finding or employment decision."}
          </p>
        </div>
      </div>
      {error && <p className="dashboard-feedback dashboard-error" role="alert">{error}</p>}
      {notice && <p className="dashboard-feedback" role="status">{notice}</p>}

      {isStudent ? (
        <>
          <form className="manager-form feedback-form" onSubmit={submitFeedback}>
            <label className="feedback-option-label">
              Trainer, course, and batch <span aria-hidden="true">*</span>
              <select
                required
                value={selectedOption}
                onChange={(event) => setSelectedOption(event.target.value)}
              >
                <option value="">Select an enrolled trainer and batch</option>
                {availableOptions.map((option) => (
                  <option key={`${option.trainer}:${option.batch}`} value={`${option.trainer}:${option.batch}`}>
                    {option.trainer_name} · {option.course_name} · {option.batch_name}
                  </option>
                ))}
              </select>
            </label>
            <div className="feedback-rating-grid">
              {ratingFields.map(([key, label]) => (
                <label key={key}>
                  {label} <span aria-hidden="true">*</span>
                  <StarRating
                    label={label}
                    value={ratings[key]}
                    onChange={(value) => setRatings((current) => ({ ...current, [key]: value }))}
                  />
                </label>
              ))}
            </div>
            <label className="feedback-option-label">
              Comments (optional)
              <textarea
                rows="4"
                maxLength="3000"
                value={comments}
                onChange={(event) => setComments(event.target.value)}
                placeholder="Share specific, respectful observations that may help improve learning."
              />
            </label>
            <button
              className="manager-button manager-button-primary"
              type="submit"
              disabled={saving || !availableOptions.length || Object.values(ratings).some((value) => !value)}
            >
              {saving ? "Submitting…" : "Submit feedback"}
            </button>
          </form>
          {!availableOptions.length && (
            <p className="feature-empty">
              {options.length
                ? "You have already submitted feedback for each currently eligible trainer and batch."
                : "No trainer is currently connected to your enrolled courses or batches."}
            </p>
          )}
          <h3 className="feedback-history-heading">Your submitted feedback</h3>
        </>
      ) : (
        <>
          <div className="feedback-filters">
            <label>Trainer
              <select value={filters.trainer} onChange={(event) => setFilters({ ...filters, trainer: event.target.value })}>
                <option value="">All trainers</option>
                {trainerOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label>Course
              <select value={filters.course} onChange={(event) => setFilters({ ...filters, course: event.target.value })}>
                <option value="">All courses</option>
                {courseOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label>Batch
              <select value={filters.batch} onChange={(event) => setFilters({ ...filters, batch: event.target.value })}>
                <option value="">All batches</option>
                {batchOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label>Rating
              <select value={filters.rating} onChange={(event) => setFilters({ ...filters, rating: event.target.value })}>
                <option value="">Any rating</option>
                {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} stars</option>)}
              </select>
            </label>
            <label>From <input type="date" value={filters.date_from} onChange={(event) => setFilters({ ...filters, date_from: event.target.value })} /></label>
            <label>To <input type="date" value={filters.date_to} onChange={(event) => setFilters({ ...filters, date_to: event.target.value })} /></label>
          </div>
          <div className="feedback-summary-cards">
            <article><span>Average overall rating</span><strong>{summary?.overall_average ?? "—"}</strong></article>
            <article><span>Reviews in this view</span><strong>{summary?.review_count ?? 0}</strong></article>
            <article><span>Teaching quality</span><strong>{summary?.teaching_average ?? "—"}</strong></article>
            <article><span>Communication</span><strong>{summary?.communication_average ?? "—"}</strong></article>
            <article><span>Subject knowledge</span><strong>{summary?.subject_knowledge_average ?? "—"}</strong></article>
          </div>
          <div className="feedback-chart" aria-label="Average ratings by trainer">
            <h3>Trainer comparison</h3>
            {summary?.trainers?.length ? summary.trainers.map((trainer) => (
              <div className="feedback-chart-row" key={trainer.trainer_id}>
                <span>{trainer.trainer_name}</span>
                <div><span style={{ width: `${Math.min(100, (trainer.overall_average || 0) * 20)}%` }} /></div>
                <strong>{trainer.overall_average} <small>({trainer.review_count})</small></strong>
                <small className="feedback-chart-breakdown">
                  Teaching {trainer.teaching_average} · Communication {trainer.communication_average} · Subject knowledge {trainer.subject_knowledge_average}
                </small>
              </div>
            )) : <p className="feature-empty">No feedback matches these filters yet.</p>}
          </div>
        </>
      )}

      {loading ? <p className="feature-empty">Loading feedback…</p> : feedback.length ? (
        <div className="feedback-record-list">
          {feedback.map((item) => (
            <article className="feedback-record" key={item.id}>
              <header>
                <div>
                  <strong>{item.trainer_name}</strong>
                  <span>{item.course_name} · {item.batch_name}</span>
                </div>
                <time>{displayDate(item.created_at)}</time>
              </header>
              <div className="feedback-record-ratings">
                {ratingFields.map(([key, label]) => (
                  <div key={key}>
                    <span>{label}</span>
                    <StarRating label={label} value={item[key]} readOnly />
                  </div>
                ))}
              </div>
              {item.comments && <p className="feedback-comments">{item.comments}</p>}
              {!isStudent && <small>Student: {item.student_name}</small>}
            </article>
          ))}
        </div>
      ) : !loading && (
        <p className="feature-empty">
          {isStudent ? "You have not submitted any trainer feedback yet." : "No feedback matches these filters."}
        </p>
      )}
    </section>
  );
}
