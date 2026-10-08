import { api } from "./api.js";

const state = {
  contacts: [],
  selectedId: null,
};

const contactList = document.querySelector(".contact-list");

function renderContactList() {
  if (state.contacts.length === 0) {
    contactList.innerHTML = '<li class="list-message">No contacts yet</li>';
    return;
  }

  contactList.replaceChildren(
    ...state.contacts.map((contact) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "contact-item";
      button.dataset.id = contact.id;
      button.textContent = `${contact.first_name} ${contact.last_name}`;
      if (contact.id === state.selectedId) {
        button.setAttribute("aria-current", "true");
      }

      const li = document.createElement("li");
      li.append(button);
      return li;
    })
  );
}

contactList.addEventListener("click", (event) => {
  const button = event.target.closest(".contact-item");
  if (!button) return;

  state.selectedId = Number(button.dataset.id);
  renderContactList();
});

async function init() {
  try {
    state.contacts = await api.listContacts();
    renderContactList();
  } catch (error) {
    contactList.innerHTML = '<li class="list-message">Couldn\'t load contacts. Refresh to try again.</li>';
  }
}

init();