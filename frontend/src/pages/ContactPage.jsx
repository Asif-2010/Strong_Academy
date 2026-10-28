import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FiArrowRight, FiMail, FiMapPin, FiPhone } from "react-icons/fi";
import api from "../services/api";

const initialValues = (searchParams) => {
  const type = searchParams.get("type");
  const course = searchParams.get("course");
  return {
    name: "",
    email: "",
    phone: "",
    enquiry_type: ["course", "general", "placement"].includes(type) ? type : "general",
    message: course ? `I would like to know more about ${course}.` : "",
  };
};

export default function ContactPage() {
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState(() => initialValues(searchParams));
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
          Object.entries(data).map(([key, value]) => [
            key,
            Array.isArray(value) ? value.join(" ") : String(value),
          ]),
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
    <div className="public-page">
      <section className="public-page-hero public-contact-hero">
        <span className="public-eyebrow">CONTACT STRONG ACADEMY</span>
        <h1>Tell us what you would like to learn</h1>
        <p>Send a course, general, or placement enquiry. Submissions are recorded for academy staff to review.</p>
      </section>
      <section className="public-section public-contact-layout">
        <div className="public-contact-info">
          <span className="public-eyebrow">GET IN TOUCH</span>
          <h2>We are ready to hear from you</h2>
          <p>Use the form to share your question. Official address, phone, email, social links, and office hours are not configured in the project yet.</p>
          <div className="public-contact-note"><FiMapPin aria-hidden="true" /><span>Academy address not configured</span></div>
          <div className="public-contact-note"><FiPhone aria-hidden="true" /><span>Official phone number not configured</span></div>
          <div className="public-contact-note"><FiMail aria-hidden="true" /><span>Official email address not configured</span></div>
        </div>
        <form className="public-enquiry-form" onSubmit={submitEnquiry}>
          <h2>Send an enquiry</h2>
          <p>All fields are required so academy staff can review your message.</p>
          {feedback.text && <div className={`public-form-feedback is-${feedback.type}`} role={feedback.type === "error" ? "alert" : "status"}>{feedback.text}</div>}
          <label htmlFor="enquiry-name">Full name</label>
          <input id="enquiry-name" name="name" autoComplete="name" maxLength="120" required value={form.name} onChange={updateField} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? "enquiry-name-error" : undefined} />
          {errors.name && <small className="public-field-error" id="enquiry-name-error">{errors.name}</small>}
          <label htmlFor="enquiry-email">Email address</label>
          <input id="enquiry-email" name="email" type="email" autoComplete="email" maxLength="254" required value={form.email} onChange={updateField} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "enquiry-email-error" : undefined} />
          {errors.email && <small className="public-field-error" id="enquiry-email-error">{errors.email}</small>}
          <label htmlFor="enquiry-phone">Phone number</label>
          <input id="enquiry-phone" name="phone" type="tel" autoComplete="tel" maxLength="30" required value={form.phone} onChange={updateField} aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? "enquiry-phone-error" : undefined} />
          {errors.phone && <small className="public-field-error" id="enquiry-phone-error">{errors.phone}</small>}
          <label htmlFor="enquiry-type">Enquiry type</label>
          <select id="enquiry-type" name="enquiry_type" value={form.enquiry_type} onChange={updateField} required aria-invalid={Boolean(errors.enquiry_type)}>
            <option value="course">Course enquiry</option>
            <option value="general">General enquiry</option>
            <option value="placement">Placement enquiry</option>
          </select>
          {errors.enquiry_type && <small className="public-field-error">{errors.enquiry_type}</small>}
          <label htmlFor="enquiry-message">Message</label>
          <textarea id="enquiry-message" name="message" rows="5" maxLength="4000" required value={form.message} onChange={updateField} aria-invalid={Boolean(errors.message)} aria-describedby={errors.message ? "enquiry-message-error" : undefined} />
          {errors.message && <small className="public-field-error" id="enquiry-message-error">{errors.message}</small>}
          <button className="public-button public-button-primary" type="submit" disabled={sending}>{sending ? "Sending…" : "Send enquiry"} <FiArrowRight aria-hidden="true" /></button>
        </form>
      </section>
    </div>
  );
}
