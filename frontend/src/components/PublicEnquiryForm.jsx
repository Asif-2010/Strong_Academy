import { useState } from "react";
import { FiArrowRight } from "react-icons/fi";
import api from "../services/api";

export default function PublicEnquiryForm() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", enquiry_type: "general", message: "" });
  const [errors, setErrors] = useState({});
  const [feedback, setFeedback] = useState({ type: "", text: "" });
  const [sending, setSending] = useState(false);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: "" }));
    setFeedback({ type: "", text: "" });
  }

  async function submitEnquiry(event) {
    event.preventDefault();
    setErrors({});
    setFeedback({ type: "", text: "" });
    setSending(true);
    try {
      const response = await api.post("public/enquiries/", form);
      setFeedback({ type: "success", text: response.data.detail || "Your enquiry has been received." });
      setForm({ name: "", email: "", phone: "", enquiry_type: "general", message: "" });
    } catch (requestError) {
      const data = requestError.response?.data;
      if (data && typeof data === "object") {
        setErrors(Object.fromEntries(
          Object.entries(data).map(([key, value]) => [key, Array.isArray(value) ? value.join(" ") : String(value)]),
        ));
      }
      setFeedback({
        type: "error",
        text: requestError.response?.status === 429
          ? "Too many enquiries were sent from this connection. Please try again later."
          : requestError.response?.status === 400
            ? "Please correct the highlighted fields and try again."
            : requestError.response?.status >= 500
              ? "The enquiry service is temporarily unavailable. Please try again later."
              : requestError.response
                ? "We could not submit your enquiry. Please try again."
                : "We could not reach the enquiry service. Please try again later.",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <form className="public-enquiry-form" onSubmit={submitEnquiry}>
      <h2>Send an enquiry</h2>
      <p>All fields are required so academy staff can review your message.</p>
      {feedback.text && <div className={`public-form-feedback is-${feedback.type}`} role={feedback.type === "error" ? "alert" : "status"}>{feedback.text}</div>}
      <label htmlFor="home-enquiry-name">Full name</label>
      <input id="home-enquiry-name" name="name" autoComplete="name" maxLength="120" required value={form.name} onChange={updateField} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? "home-enquiry-name-error" : undefined} />
      {errors.name && <small className="public-field-error" id="home-enquiry-name-error">{errors.name}</small>}
      <label htmlFor="home-enquiry-email">Email address</label>
      <input id="home-enquiry-email" name="email" type="email" autoComplete="email" maxLength="254" required value={form.email} onChange={updateField} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "home-enquiry-email-error" : undefined} />
      {errors.email && <small className="public-field-error" id="home-enquiry-email-error">{errors.email}</small>}
      <label htmlFor="home-enquiry-phone">Phone number</label>
      <input id="home-enquiry-phone" name="phone" type="tel" autoComplete="tel" maxLength="30" required value={form.phone} onChange={updateField} aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? "home-enquiry-phone-error" : undefined} />
      {errors.phone && <small className="public-field-error" id="home-enquiry-phone-error">{errors.phone}</small>}
      <label htmlFor="home-enquiry-type">Enquiry type</label>
      <select id="home-enquiry-type" name="enquiry_type" value={form.enquiry_type} onChange={updateField} required aria-invalid={Boolean(errors.enquiry_type)}>
        <option value="general">General enquiry</option>
        <option value="course">Course enquiry</option>
        <option value="placement">Placement enquiry</option>
      </select>
      {errors.enquiry_type && <small className="public-field-error">{errors.enquiry_type}</small>}
      <label htmlFor="home-enquiry-message">Message</label>
      <textarea id="home-enquiry-message" name="message" rows="5" maxLength="4000" required value={form.message} onChange={updateField} aria-invalid={Boolean(errors.message)} aria-describedby={errors.message ? "home-enquiry-message-error" : undefined} />
      {errors.message && <small className="public-field-error" id="home-enquiry-message-error">{errors.message}</small>}
      <button className="public-button public-button-primary" type="submit" disabled={sending}>{sending ? "Sending…" : "Send enquiry"} <FiArrowRight aria-hidden="true" /></button>
    </form>
  );
}
