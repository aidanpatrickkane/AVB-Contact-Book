import { api } from "./api.js";

// same limits as the api (app.py) and the database (schema.sql) so all three agree
const NAME_MAX = 100;
const EMAIL_MAX = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// all the ui data lives here. to change what's on screen, update state and then call a render function
const state = {
  contacts: [],        // what's actually saved in the database
  search: "",
  selectedId: null,    // id of the contact being edited, null when making a new one or nothing is open
  isNew: false,        // true while the form is for a brand new contact
  draft: null,         // the copy the user is editing { first_name, last_name, emails }
  newEmail: null,      // whatever's typed in the add email input, null when the input is closed
  newEmailError: "",
  showErrors: false,   // don't yell at the user about names until they've tried to save once
  serverErrors: {},    // field errors the api sent back with a 422
  formError: "",
  saving: false,
};

// ---------- elements ----------
const $ = (selector) => document.querySelector(selector);

const el = {
  newContactButton: $("#new-contact-button"),
  searchInput: $("#search-input"),
  contactList: $(".contact-list"),
  emptyMessage: $(".detail-empty"),
  form: $(".contact-form"),
  formTitle: $(".form-title"),
  firstName: $("#first-name"),
  firstNameError: $("#first-name-error"),
  lastName: $("#last-name"),
  lastNameError: $("#last-name-error"),
  nameHint: $(".name-hint"),
  emailList: $(".email-list"),
  newEmailRow: $(".new-email"),
  newEmailInput: $("#new-email-input"),
  newEmailAdd: $("#new-email-add"),
  newEmailCancel: $("#new-email-cancel"),
  newEmailError: $("#new-email-error"),
  emailsError: $("#emails-error"),
  addEmailButton: $("#add-email-button"),
  formError: $(".form-error"),
  deleteButton: $("#delete-button"),
  cancelButton: $("#cancel-button"),
  saveButton: $("#save-button"),
  confirmDialog: $("#confirm-dialog"),
  confirmTitle: $("#confirm-title"),
  confirmMessage: $("#confirm-message"),
  confirmOk: $("#confirm-ok"),
  toastRegion: $(".toast-region"),
};

// ---------- helpers ----------
const fullName = (contact) => `${contact.first_name} ${contact.last_name}`;
const sameText = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

function selectedContact() {
  return state.contacts.find((contact) => contact.id === state.selectedId);
}

// checks if the user changed anything since they opened the contact
function isDirty() {
  if (!state.draft) return false;
  const saved = state.isNew ? { first_name: "", last_name: "", emails: [] } : selectedContact();
  return (
    state.draft.first_name.trim() !== saved.first_name ||
    state.draft.last_name.trim() !== saved.last_name ||
    state.draft.emails.join() !== saved.emails.join() ||
    Boolean(state.newEmail?.trim())
  );
}

function visibleContacts() {
  const query = state.search.trim().toLowerCase();
  if (!query) return state.contacts;
  return state.contacts.filter(
    (contact) =>
      fullName(contact).toLowerCase().includes(query) ||
      contact.emails.some((email) => email.toLowerCase().includes(query))
  );
}

// ---------- validation ----------
// same rules as the api, just checked here first so the user gets feedback right away
function validateName(value, label) {
  const name = value.trim();
  if (!name) return `${label} is required.`;
  if (name.length > NAME_MAX) return `${label} must be ${NAME_MAX} characters or fewer.`;
  return "";
}

function validateEmail(value, existingEmails) {
  const email = value.trim();
  if (!email) return "Enter an email address.";
  if (email.length > EMAIL_MAX) return `Email must be ${EMAIL_MAX} characters or fewer.`;
  if (!EMAIL_PATTERN.test(email)) return "Enter a valid email, like name@example.com.";
  if (existingEmails.some((existing) => sameText(existing, email))) {
    return "This contact already has that email.";
  }
  return "";
}

function nameErrors() {
  return {
    first_name:
      state.serverErrors.first_name ||
      (state.showErrors ? validateName(state.draft.first_name, "First name") : ""),
    last_name:
      state.serverErrors.last_name ||
      (state.showErrors ? validateName(state.draft.last_name, "Last name") : ""),
  };
}

// fastapi sends 422s like { detail: [{ loc: ["body", "first_name"], msg }] }, this turns that into { first_name: msg }
function parseValidationErrors(body) {
  const errors = {};
  if (!Array.isArray(body?.detail)) return errors;
  for (const item of body.detail) {
    const field = item.loc?.[1];
    if (field && !errors[field]) errors[field] = item.msg.replace(/^Value error, /, "");
  }
  return errors;
}

// ---------- rendering ----------
function render() {
  renderContactList();
  renderForm();
}

function messageItem(text) {
  const li = document.createElement("li");
  li.className = "list-message";
  li.textContent = text;
  return li;
}

function renderContactList() {
  if (state.contacts.length === 0) {
    el.contactList.replaceChildren(messageItem("No contacts yet. Add one with +."));
    return;
  }

  const contacts = visibleContacts();
  if (contacts.length === 0) {
    el.contactList.replaceChildren(messageItem(`No contacts match "${state.search.trim()}".`));
    return;
  }

  el.contactList.replaceChildren(
    ...contacts.map((contact) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "contact-item";
      button.dataset.id = contact.id;
      button.textContent = fullName(contact);
      if (contact.id === state.selectedId) {
        button.setAttribute("aria-current", "true");
      }

      const li = document.createElement("li");
      li.append(button);
      return li;
    })
  );
}

// fills the inputs from the draft. only called when opening or resetting a contact, never while the user
// is typing, because setting input.value mid typing jumps the cursor to the end
function renderForm() {
  el.form.hidden = !state.draft;
  el.emptyMessage.hidden = Boolean(state.draft);
  if (!state.draft) return;

  el.firstName.value = state.draft.first_name;
  el.lastName.value = state.draft.last_name;
  renderEmails();
  renderFeedback();
}

function renderEmails() {
  el.emailList.replaceChildren(
    ...state.draft.emails.map((email, index) => {
      const text = document.createElement("span");
      text.className = "email-address";
      text.textContent = email;

      // figma comment 1, delete button shows on hover (css handles the hover part)
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "icon-button remove";
      removeButton.dataset.index = index;
      removeButton.setAttribute("aria-label", `Remove ${email}`);
      removeButton.textContent = "−";

      const li = document.createElement("li");
      li.className = "email-item";
      li.append(text, removeButton);
      return li;
    })
  );

  // figma comment 2, clicking add email swaps it out for an input to type the new email
  const isAdding = state.newEmail !== null;
  el.newEmailRow.hidden = !isAdding;
  el.addEmailButton.hidden = isAdding;
  el.newEmailInput.value = state.newEmail ?? "";
}

function showError(element, message, input) {
  element.textContent = message;
  element.hidden = !message;
  if (input) input.setAttribute("aria-invalid", message ? "true" : "false");
}

// updates errors, hints, and button states. doesn't touch input values so it's safe to call on every keystroke
function renderFeedback() {
  if (!state.draft) return;

  const errors = nameErrors();
  showError(el.firstNameError, errors.first_name, el.firstName);
  showError(el.lastNameError, errors.last_name, el.lastName);
  showError(el.newEmailError, state.newEmailError, el.newEmailInput);
  showError(el.emailsError, state.serverErrors.emails || "");
  showError(el.formError, state.formError);

  // two people can have the same name so this is just a hint, not an error
  const { first_name, last_name } = state.draft;
  const sameName = state.contacts.find(
    (contact) =>
      contact.id !== state.selectedId &&
      first_name.trim() &&
      sameText(contact.first_name, first_name) &&
      sameText(contact.last_name, last_name)
  );
  showError(el.nameHint, sameName ? `You already have a contact named ${fullName(sameName)}.` : "");

  // save and cancel only do something once there's a change, except for a new contact where they always work
  const unchanged = !state.isNew && !isDirty();
  el.formTitle.hidden = !state.isNew;
  el.deleteButton.hidden = state.isNew;
  el.deleteButton.disabled = state.saving;
  el.cancelButton.disabled = state.saving || unchanged;
  el.saveButton.disabled = state.saving || unchanged;
  el.saveButton.textContent = state.saving ? "Saving…" : "Save";
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  el.toastRegion.append(toast);
  setTimeout(() => toast.remove(), 3500);
}

// opens the are you sure popup. gives back true if they confirmed, false if they hit cancel or esc
function confirmDialog(title, message, confirmLabel) {
  el.confirmTitle.textContent = title;
  el.confirmMessage.textContent = message;
  el.confirmOk.textContent = confirmLabel;
  el.confirmDialog.returnValue = "";
  el.confirmDialog.showModal();

  return new Promise((resolve) => {
    el.confirmDialog.addEventListener(
      "close",
      () => resolve(el.confirmDialog.returnValue === "confirm"),
      { once: true }
    );
  });
}

// ---------- actions ----------
function resetFormState() {
  state.newEmail = null;
  state.newEmailError = "";
  state.showErrors = false;
  state.serverErrors = {};
  state.formError = "";
}

function openContact(contact) {
  state.selectedId = contact.id;
  state.isNew = false;
  state.draft = {
    first_name: contact.first_name,
    last_name: contact.last_name,
    emails: [...contact.emails], // copy the array so editing the draft doesn't also change the saved contact
  };
  resetFormState();
  render();
}

function openNewContact() {
  state.selectedId = null;
  state.isNew = true;
  state.draft = { first_name: "", last_name: "", emails: [] };
  resetFormState();
  render();
  el.firstName.focus();
}

function closeForm() {
  state.selectedId = null;
  state.isNew = false;
  state.draft = null;
  resetFormState();
  render();
}

// if there are unsaved edits, ask before leaving instead of just throwing them away
async function okToLeave() {
  if (!isDirty()) return true;
  return confirmDialog(
    "Discard unsaved changes?",
    "You've made changes to this contact that haven't been saved.",
    "Discard"
  );
}

// adds the typed email to the draft. returns false and shows the error if it's not valid
function addNewEmail() {
  const email = (state.newEmail ?? "").trim();
  const error = validateEmail(email, state.draft.emails);
  if (error) {
    state.newEmailError = error;
    renderFeedback();
    return false;
  }

  state.draft.emails.push(email);
  state.newEmail = ""; // leave the input open and empty so they can add another one
  state.newEmailError = "";
  delete state.serverErrors.emails;
  renderEmails();
  renderFeedback();
  el.newEmailInput.focus();
  return true;
}

async function loadContacts() {
  state.contacts = await api.listContacts();
}

async function save() {
  if (state.saving) return;

  // if they typed an email but didn't hit add, include it instead of silently losing it
  if (state.newEmail?.trim() && !addNewEmail()) return;

  state.showErrors = true;
  const errors = nameErrors();
  if (errors.first_name || errors.last_name) {
    renderFeedback();
    return;
  }

  const contact = {
    first_name: state.draft.first_name.trim(),
    last_name: state.draft.last_name.trim(),
    emails: state.draft.emails,
  };
  const wasNew = state.isNew;

  state.saving = true;
  state.formError = "";
  renderFeedback();

  try {
    const saved = wasNew
      ? await api.createContact(contact)
      : await api.updateContact(state.selectedId, contact);

    await loadContacts(); // get the list again so the sidebar has the name in the right sorted spot
    state.saving = false;
    openContact(saved);
    showToast(wasNew ? `Added ${fullName(saved)}` : "Changes saved");
  } catch (error) {
    state.saving = false;
    if (error.status === 404) {
      // someone deleted it somewhere else (like another tab) while it was open here
      showToast("That contact no longer exists.");
      await loadContacts();
      closeForm();
      return;
    }
    if (error.status === 422) {
      state.serverErrors = parseValidationErrors(error.body);
      state.formError = "Please fix the highlighted fields.";
    } else {
      state.formError = "Couldn't save. Check your connection and try again.";
    }
    renderFeedback();
  }
}

async function deleteContact() {
  const contact = selectedContact();
  const confirmed = await confirmDialog(
    `Delete ${fullName(contact)}?`,
    "This permanently removes the contact and all of their emails.",
    "Delete"
  );
  if (!confirmed) return;

  try {
    await api.deleteContact(contact.id);
  } catch (error) {
    // a 404 means it was already gone, which is what the user wanted anyway
    if (error.status !== 404) {
      state.formError = "Couldn't delete. Check your connection and try again.";
      renderFeedback();
      return;
    }
  }

  state.contacts = state.contacts.filter((c) => c.id !== contact.id);
  closeForm();
  showToast(`Deleted ${fullName(contact)}`);
}

// ---------- events ----------
el.newContactButton.addEventListener("click", async () => {
  if (await okToLeave()) openNewContact();
});

el.searchInput.addEventListener("input", () => {
  state.search = el.searchInput.value;
  renderContactList();
});

// one listener on the whole list (event delegation) since the buttons get rebuilt every render
el.contactList.addEventListener("click", async (event) => {
  const button = event.target.closest(".contact-item");
  if (!button) return;

  const contact = state.contacts.find((c) => c.id === Number(button.dataset.id));
  if (contact.id === state.selectedId) return;
  if (await okToLeave()) openContact(contact);
});

el.firstName.addEventListener("input", () => {
  state.draft.first_name = el.firstName.value;
  delete state.serverErrors.first_name;
  renderFeedback();
});

el.lastName.addEventListener("input", () => {
  state.draft.last_name = el.lastName.value;
  delete state.serverErrors.last_name;
  renderFeedback();
});

el.addEmailButton.addEventListener("click", () => {
  state.newEmail = "";
  renderEmails();
  el.newEmailInput.focus();
});

el.newEmailCancel.addEventListener("click", () => {
  state.newEmail = null;
  state.newEmailError = "";
  renderEmails();
  renderFeedback();
});

el.newEmailAdd.addEventListener("click", addNewEmail);

el.newEmailInput.addEventListener("input", () => {
  state.newEmail = el.newEmailInput.value;
  state.newEmailError = "";
  renderFeedback();
});

el.newEmailInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault(); // otherwise enter would submit the whole form
    addNewEmail();
  }
});

el.emailList.addEventListener("click", (event) => {
  const button = event.target.closest(".remove");
  if (!button) return;

  state.draft.emails.splice(Number(button.dataset.index), 1);
  delete state.serverErrors.emails;
  renderEmails();
  renderFeedback();
});

el.cancelButton.addEventListener("click", () => {
  if (state.isNew) closeForm();
  else openContact(selectedContact()); // throw away the draft and start over from the saved version
});

el.deleteButton.addEventListener("click", deleteContact);

el.form.addEventListener("submit", (event) => {
  event.preventDefault(); // stop the browser from reloading the page
  save();
});

// warn before closing or refreshing the tab if there are unsaved changes
window.addEventListener("beforeunload", (event) => {
  if (isDirty()) event.preventDefault();
});

// ---------- start ----------
async function init() {
  try {
    await loadContacts();
    render();
  } catch {
    el.contactList.replaceChildren(messageItem("Couldn't load contacts. Refresh to try again."));
  }
}

init();
