async function request(path, options= {}) {
    const response = await fetch(`/api${path}`, {
        headers: { "Content-Type": "application/json" },
        ...options
    });

    if (!response.ok) {
        const body = await response.json().catch(() => null);
        const error = new Error(
            typeof body?.detail === "string" ? body.detail : `Request failed (${response.status})`
        );
        error.status = response.status;
        error.body = body;
        throw error;
    }

    return response.status === 204 ? null : response.json();
}

export const api = {
    listContacts: () => request("/contacts"),
    getContact: (id) => request(`/contacts/${id}`),
    createContact: (contact) =>
        request("/contacts", { method: "POST", body: JSON.stringify(contact) }),
    updateContact: (id, contact) =>
        request(`/contacts/${id}`, { method: "PUT", body: JSON.stringify(contact) }),
    deleteContact: (id) => request(`/contacts/${id}`, { method: "DELETE" }),

}