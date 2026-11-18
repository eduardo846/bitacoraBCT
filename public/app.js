const form = document.querySelector("#entry-form");
const entryDialog = document.querySelector("#entry-dialog");
const deleteDialog = document.querySelector("#delete-dialog");
const recordsBody = document.querySelector("#records-body");
const formMessage = document.querySelector("#form-message");
const pageMessage = document.querySelector("#page-message");
const searchInput = document.querySelector("#search");
const dayFilter = document.querySelector("#day-filter");
const monthFilter = document.querySelector("#month-filter");
const saveButton = document.querySelector("#save-entry");
const dialogTitle = document.querySelector("#dialog-title");
const exportButton = document.querySelector("#export-month");
const authPanel = document.querySelector("#auth-panel");
const authMessage = document.querySelector("#auth-message");
const appContent = document.querySelector("#app-content");
const loginButton = document.querySelector("#login-button");
const logoutButton = document.querySelector("#logout-button");
const identityEmail = document.querySelector("#identity-email");
const localDevelopment = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  && !new URLSearchParams(window.location.search).has("identity");
let entries = [];
let pendingDeleteId = null;
let messageTimer;

const today = new Date();
const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
dayFilter.value = localDate;
document.querySelector("#today-label").textContent = new Intl.DateTimeFormat("es", {
  weekday: "long", day: "numeric", month: "long", year: "numeric"
}).format(today);

function showPageMessage(message, isError = false) {
  window.clearTimeout(messageTimer);
  pageMessage.textContent = message;
  pageMessage.classList.toggle("is-error", isError);
  messageTimer = window.setTimeout(() => {
    pageMessage.textContent = "";
    pageMessage.classList.remove("is-error");
  }, 4500);
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!localDevelopment) {
    const identity = window.netlifyIdentity;
    if (!identity || !identity.currentUser()) {
      throw new Error("Inicia sesión para continuar.");
    }
    headers.set("Authorization", `Bearer ${await identity.refresh()}`);
  }
  const response = await fetch(path, { ...options, headers });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || "No se pudo completar la solicitud.");
  return result;
}

function formatDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return `${day}/${month}/${year}`;
}

function formatHours(value) {
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function getVisibleEntries() {
  const query = searchInput.value.trim().toLocaleLowerCase("es");
  const day = dayFilter.value;
  const month = monthFilter.value;
  return entries
    .filter((entry) => !day || entry.fecha === day)
    .filter((entry) => !month || entry.fecha.startsWith(month))
    .filter((entry) => !query || [
      entry.consultor,
      entry.cliente,
      entry.proyecto,
      entry.pais,
      entry.actividad,
      entry.descripcion
    ].some((value) => value.toLocaleLowerCase("es").includes(query)))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || a.horaInicio.localeCompare(b.horaInicio));
}

function makeCell(value, className = "") {
  const cell = document.createElement("td");
  if (className) cell.className = className;
  cell.textContent = value;
  return cell;
}

function activityClass(activity) {
  if (activity === "Vacaciones o Feriado") return "row-leave";
  if (activity === "Almuerzo") return "row-meal";
  if (activity === "Cita Médica") return "row-appointment";
  if (activity === "Reuniones") return "row-meeting";
  return "row-work";
}

function renderEntries() {
  const visibleEntries = getVisibleEntries();
  const selectedMonth = monthFilter.value;
  const hasMonthlyEntries = selectedMonth && entries.some((entry) => entry.fecha.startsWith(selectedMonth));
  exportButton.disabled = !hasMonthlyEntries;
  exportButton.title = !selectedMonth
    ? "Selecciona un mes para exportar"
    : hasMonthlyEntries
      ? `Descargar registros de ${selectedMonth} en Excel`
      : "No hay registros para el mes seleccionado";
  const totalHours = visibleEntries.reduce((total, entry) => total + entry.tiempo, 0);
  const clients = new Set(visibleEntries.map((entry) => entry.cliente.toLocaleLowerCase("es")));
  const hoursValue = document.querySelector("#total-hours");
  const hoursUnit = document.createElement("small");
  hoursUnit.textContent = " h";
  hoursValue.replaceChildren(document.createTextNode(formatHours(totalHours)), hoursUnit);
  document.querySelector("#total-entries").textContent = String(visibleEntries.length);
  document.querySelector("#total-clients").textContent = String(clients.size);
  document.querySelector("#record-counter").textContent =
    `${visibleEntries.length} ${visibleEntries.length === 1 ? "registro" : "registros"}`;

  recordsBody.replaceChildren();
  if (visibleEntries.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.className = "empty-cell";
    cell.colSpan = 11;
    const selectedDay = dayFilter.value;
    const hasEntriesForDay = entries.some((entry) => entry.fecha === selectedDay);
    cell.textContent = entries.length === 0
      ? "Todavía no hay actividades. Usa «Registrar actividad» para agregar la primera."
      : selectedDay && !monthFilter.value && !hasEntriesForDay
        ? `No hay registros para ${formatDate(selectedDay)}. Los de otras fechas siguen guardados; elige otro día o un mes para consultarlos.`
        : "No se encontraron registros con esos filtros.";
    row.append(cell);
    recordsBody.append(row);
    return;
  }

  for (const entry of visibleEntries) {
    const row = document.createElement("tr");
    row.className = activityClass(entry.actividad);
    row.append(
      makeCell(entry.consultor),
      makeCell(formatDate(entry.fecha)),
      makeCell(entry.cliente, "cell-strong"),
      makeCell(entry.proyecto),
      makeCell(entry.pais),
      makeCell(entry.actividad),
      makeCell(entry.descripcion, "description-cell"),
      makeCell(entry.horaInicio, "time-cell"),
      makeCell(entry.horaFin, "time-cell"),
      makeCell(entry.tiempo === 0 ? "—" : formatHours(entry.tiempo), "time-cell duration-cell")
    );

    const actions = document.createElement("td");
    actions.className = "row-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "icon-button";
    edit.textContent = "Editar";
    edit.setAttribute("aria-label", `Editar registro de ${entry.consultor}, ${formatDate(entry.fecha)}`);
    edit.addEventListener("click", () => openEditDialog(entry));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "icon-button delete-action";
    remove.textContent = "Eliminar";
    remove.setAttribute("aria-label", `Eliminar registro de ${entry.consultor}, ${formatDate(entry.fecha)}`);
    remove.addEventListener("click", () => openDeleteDialog(entry.id));
    actions.append(edit, remove);
    row.append(actions);
    recordsBody.append(row);
  }
}

function resetForm() {
  form.reset();
  form.elements.id.value = "";
  form.elements.fecha.value = localDate;
  form.elements.horaInicio.value = "08:00";
  form.elements.horaFin.value = "17:00";
  dialogTitle.textContent = "Nueva actividad";
  saveButton.textContent = "Guardar registro";
  formMessage.textContent = "";
  formMessage.classList.remove("is-error");
}

function openNewDialog() {
  resetForm();
  entryDialog.showModal();
  form.elements.consultor.focus();
}

function openEditDialog(entry) {
  resetForm();
  for (const field of ["consultor", "fecha", "cliente", "proyecto", "pais", "actividad", "descripcion", "horaInicio", "horaFin"]) {
    form.elements[field].value = entry[field];
  }
  form.elements.id.value = entry.id;
  dialogTitle.textContent = "Editar actividad";
  saveButton.textContent = "Guardar cambios";
  entryDialog.showModal();
  form.elements.consultor.focus();
}

function openDeleteDialog(id) {
  pendingDeleteId = id;
  deleteDialog.showModal();
}

document.querySelector("#new-entry").addEventListener("click", openNewDialog);
document.querySelector("#close-dialog").addEventListener("click", () => entryDialog.close());
document.querySelector("#cancel-dialog").addEventListener("click", () => entryDialog.close());
document.querySelector("#cancel-delete").addEventListener("click", () => {
  pendingDeleteId = null;
  deleteDialog.close();
});
document.querySelector("#clear-filters").addEventListener("click", () => {
  searchInput.value = "";
  monthFilter.value = "";
  dayFilter.value = localDate;
  renderEntries();
});
searchInput.addEventListener("input", renderEntries);
dayFilter.addEventListener("change", () => {
  if (dayFilter.value) monthFilter.value = "";
  renderEntries();
});
monthFilter.addEventListener("change", () => {
  if (monthFilter.value) dayFilter.value = "";
  renderEntries();
});

exportButton.addEventListener("click", async () => {
  const month = monthFilter.value;
  if (!month || exportButton.disabled) return;
  exportButton.disabled = true;
  try {
    const headers = new Headers();
    if (!localDevelopment) {
      headers.set("Authorization", `Bearer ${await window.netlifyIdentity.refresh()}`);
    }
    const response = await fetch(`/api/registros/exportar?mes=${encodeURIComponent(month)}`, { headers });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "No se pudo exportar el archivo.");
    }
    const file = await response.blob();
    const downloadUrl = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `bitacora_${month}.xlsx`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    showPageMessage(`Archivo Excel de ${month} descargado.`);
  } catch (error) {
    showPageMessage(error.message, true);
  } finally {
    renderEntries();
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  saveButton.disabled = true;
  formMessage.textContent = "";
  const id = form.elements.id.value;
  const payload = Object.fromEntries(new FormData(form));
  delete payload.id;
  try {
    await request(id ? `/api/registros/${encodeURIComponent(id)}` : "/api/registros", {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    await loadEntries();
    entryDialog.close();
    resetForm();
    showPageMessage(id ? "Actividad actualizada." : "Actividad guardada.");
  } catch (error) {
    formMessage.textContent = error.message;
    formMessage.classList.add("is-error");
  } finally {
    saveButton.disabled = false;
  }
});

document.querySelector("#confirm-delete").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  if (!pendingDeleteId) return;
  button.disabled = true;
  try {
    await request(`/api/registros/${encodeURIComponent(pendingDeleteId)}`, { method: "DELETE" });
    await loadEntries();
    deleteDialog.close();
    showPageMessage("Registro eliminado.");
  } catch (error) {
    deleteDialog.close();
    showPageMessage(error.message, true);
  } finally {
    pendingDeleteId = null;
    button.disabled = false;
  }
});

document.querySelectorAll("dialog").forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
});

async function loadEntries() {
  entries = await request("/api/registros");
  renderEntries();
}

function showLoadError(error) {
  console.error(error);
  recordsBody.replaceChildren();
  const row = document.createElement("tr");
  const cell = makeCell(`No se pudieron cargar los registros: ${error.message}`, "empty-cell");
  cell.colSpan = 11;
  row.append(cell);
  recordsBody.append(row);
}

function showAuthenticatedApp(user) {
  identityEmail.textContent = user.email || "";
  identityEmail.hidden = !user.email;
  loginButton.hidden = true;
  logoutButton.hidden = false;
  authPanel.hidden = true;
  appContent.hidden = false;
  loadEntries().catch(showLoadError);
}

function showLogin(message) {
  identityEmail.hidden = true;
  logoutButton.hidden = true;
  loginButton.hidden = false;
  appContent.hidden = true;
  authPanel.hidden = false;
  authMessage.textContent = message;
  recordsBody.replaceChildren();
}

document.querySelector("#auth-login").addEventListener("click", () => {
  if (window.netlifyIdentity) window.netlifyIdentity.open("login");
});
loginButton.addEventListener("click", () => window.netlifyIdentity?.open("login"));
logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;
  try {
    await window.netlifyIdentity.logout();
  } catch (error) {
    showPageMessage(error.message || "No se pudo cerrar la sesión.", true);
  } finally {
    logoutButton.disabled = false;
  }
});

if (localDevelopment) {
  appContent.hidden = false;
  authPanel.hidden = true;
  loginButton.hidden = true;
  logoutButton.hidden = true;
  loadEntries().catch(showLoadError);
} else if (!window.netlifyIdentity) {
  showLogin("No se pudo cargar el inicio de sesión. Verifica tu conexión y vuelve a cargar la página.");
  loginButton.disabled = true;
} else {
  window.netlifyIdentity.setLocale("es");
  window.netlifyIdentity.on("init", (user) => {
    if (!user) {
      showLogin("Inicia sesión con la cuenta que te invitó el administrador para consultar y administrar los registros.");
      return;
    }
    showAuthenticatedApp(user);
  });
  window.netlifyIdentity.on("login", (user) => {
    window.netlifyIdentity.close();
    showAuthenticatedApp(user);
  });
  window.netlifyIdentity.on("logout", () => {
    entries = [];
    showLogin("La sesión se cerró. Inicia sesión para volver a acceder a la bitácora.");
  });
  window.netlifyIdentity.on("error", (error) => {
    showLogin(error.message || "No se pudo completar la autenticación. Inténtalo de nuevo.");
  });
  window.netlifyIdentity.init();
}
