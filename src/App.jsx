import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "firebase/auth";

const RECORD_FIELDS = [
  "consultor",
  "fecha",
  "cliente",
  "proyecto",
  "pais",
  "actividad",
  "descripcion",
  "horaInicio",
  "horaFin"
];

const ACTIVITIES = [
  "Desarrollo",
  "Reuniones",
  "Almuerzo",
  "Cita Médica",
  "Vacaciones o Feriado",
  "Soporte",
  "Otro"
];

const PAGE_SIZE = 12;

function localDate() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

function newRecord() {
  return {
    consultor: "Héctor E Ramirez",
    fecha: localDate(),
    cliente: "BCT",
    proyecto: "",
    pais: "Costa Rica",
    actividad: "Desarrollo",
    descripcion: "",
    horaInicio: "08:00",
    horaFin: "17:00"
  };
}

function formatDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return `${day}/${month}/${year}`;
}

function formatHours(value) {
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value) || 0);
}

function activityClass(activity) {
  if (activity === "Vacaciones o Feriado") return "row-leave";
  if (activity === "Almuerzo") return "row-meal";
  if (activity === "Cita Médica") return "row-appointment";
  if (activity === "Reuniones") return "row-meeting";
  return "row-work";
}

async function apiRequest(path, user, options = {}) {
  if (!user) throw new Error("Inicia sesión para continuar.");

  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${await user.getIdToken()}`);
  const response = await fetch(path, { ...options, headers });
  let result = null;
  try {
    result = await response.json();
  } catch {
    result = null;
  }
  if (!response.ok) {
    throw new Error(result?.message || "No se pudo completar la solicitud.");
  }
  return result;
}

function firebaseAuth() {
  const env = import.meta.env;
  const projectId = env.VITE_FIREBASE_PROJECT_ID?.trim();
  const config = {
    apiKey: env.VITE_FIREBASE_API_KEY?.trim(),
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN?.trim() || `${projectId || ""}.firebaseapp.com`,
    projectId,
    appId: env.VITE_FIREBASE_APP_ID?.trim(),
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET?.trim() || undefined,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim() || undefined
  };
  const required = [
    ["VITE_FIREBASE_API_KEY", config.apiKey],
    ["VITE_FIREBASE_PROJECT_ID", config.projectId],
    ["VITE_FIREBASE_APP_ID", config.appId]
  ];
  const missing = required.filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) {
    throw new Error(`Configura ${missing.join(", ")} en las variables de entorno de Vite.`);
  }

  const app = getApps().length ? getApp() : initializeApp(config);
  return getAuth(app);
}

function firebaseLoginMessage(error) {
  if (["auth/invalid-credential", "auth/user-not-found", "auth/wrong-password"].includes(error.code)) {
    return "El correo o la contraseña no son correctos.";
  }
  const messages = {
    "auth/invalid-email": "Indica un correo electrónico válido.",
    "auth/network-request-failed": "No se pudo conectar con Firebase. Revisa tu conexión.",
    "auth/unauthorized-domain": "Este dominio no está autorizado en Firebase Authentication."
  };
  return messages[error.code] || error.message || "No se pudo iniciar sesión.";
}

export default function App() {
  const [auth, setAuth] = useState(null);
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMessage, setAuthMessage] = useState("Cargando Firebase Authentication…");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [entries, setEntries] = useState([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [dayFilter, setDayFilter] = useState(localDate);
  const [monthFilter, setMonthFilter] = useState("");
  const [pageMessage, setPageMessage] = useState("");
  const [pageMessageIsError, setPageMessageIsError] = useState(false);
  const [recordForm, setRecordForm] = useState(newRecord);
  const [editingId, setEditingId] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [savingRecord, setSavingRecord] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [deletingRecord, setDeletingRecord] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const entryDialog = useRef(null);
  const deleteDialog = useRef(null);
  const messageTimer = useRef(null);

  const todayLabel = useMemo(
    () => new Intl.DateTimeFormat("es", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(new Date()),
    []
  );

  useEffect(() => {
    let unsubscribe;
    try {
      const currentAuth = firebaseAuth();
      setAuth(currentAuth);
      unsubscribe = onAuthStateChanged(currentAuth, (currentUser) => {
        setUser(currentUser);
        setPassword("");
        setAuthMessage(currentUser ? "" : "Inicia sesión con tu correo y contraseña de Firebase.");
        setAuthReady(true);
      }, (error) => {
        setAuthMessage(error.message || "No se pudo verificar la sesión.");
        setAuthReady(true);
      });
    } catch (error) {
      setAuthMessage(error.message || "No se pudo iniciar Firebase Authentication.");
      setAuthReady(true);
    }
    return () => unsubscribe?.();
  }, []);

  const fetchEntries = useCallback(() => apiRequest("/api/registros", user), [user]);

  useEffect(() => {
    if (!user) {
      setEntries([]);
      setLoadError("");
      setLoadingEntries(false);
      return undefined;
    }

    let active = true;
    setLoadingEntries(true);
    setLoadError("");
    fetchEntries()
      .then((result) => {
        if (active) setEntries(result);
      })
      .catch((error) => {
        if (active) {
          setEntries([]);
          setLoadError(error.message);
        }
      })
      .finally(() => {
        if (active) setLoadingEntries(false);
      });

    return () => {
      active = false;
    };
  }, [fetchEntries, user]);

  useEffect(() => () => window.clearTimeout(messageTimer.current), []);

  const notify = useCallback((message, isError = false) => {
    window.clearTimeout(messageTimer.current);
    setPageMessage(message);
    setPageMessageIsError(isError);
    messageTimer.current = window.setTimeout(() => {
      setPageMessage("");
      setPageMessageIsError(false);
    }, 4500);
  }, []);

  const visibleEntries = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es");
    return entries
      .filter((entry) => !dayFilter || entry.fecha === dayFilter)
      .filter((entry) => !monthFilter || entry.fecha.startsWith(monthFilter))
      .filter((entry) => !query || [
        entry.consultor,
        entry.cliente,
        entry.proyecto,
        entry.pais,
        entry.actividad,
        entry.descripcion
      ].some((value) => String(value || "").toLocaleLowerCase("es").includes(query)))
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || a.horaInicio.localeCompare(b.horaInicio));
  }, [dayFilter, entries, monthFilter, search]);

  const totalPages = Math.max(1, Math.ceil(visibleEntries.length / PAGE_SIZE));
  const paginatedEntries = visibleEntries.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );
  const firstVisibleRow = visibleEntries.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const lastVisibleRow = Math.min(currentPage * PAGE_SIZE, visibleEntries.length);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, dayFilter, monthFilter]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const totalHours = visibleEntries.reduce((total, entry) => total + (Number(entry.tiempo) || 0), 0);
  const clients = new Set(visibleEntries.map((entry) => String(entry.cliente || "").toLocaleLowerCase("es")));
  const hasMonthlyEntries = Boolean(
    monthFilter && entries.some((entry) => entry.fecha.startsWith(monthFilter))
  );

  async function handleLogin(event) {
    event.preventDefault();
    if (!auth) return;
    setSigningIn(true);
    setAuthMessage("");
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      setEmail("");
      setPassword("");
    } catch (error) {
      setAuthMessage(firebaseLoginMessage(error));
    } finally {
      setSigningIn(false);
    }
  }

  async function handleLogout() {
    if (!auth) return;
    setSigningOut(true);
    try {
      await signOut(auth);
    } catch (error) {
      notify(error.message || "No se pudo cerrar la sesión.", true);
    } finally {
      setSigningOut(false);
    }
  }

  async function reloadEntries() {
    const result = await fetchEntries();
    setEntries(result);
    setLoadError("");
  }

  function openNewRecord() {
    setEditingId("");
    setRecordForm(newRecord());
    setFormMessage("");
    entryDialog.current?.showModal();
  }

  function openEditRecord(entry) {
    setEditingId(entry.id);
    setRecordForm(Object.fromEntries(RECORD_FIELDS.map((field) => [field, entry[field] || ""])));
    setFormMessage("");
    entryDialog.current?.showModal();
  }

  function updateRecordField(event) {
    const { name, value } = event.target;
    setRecordForm((previous) => ({ ...previous, [name]: value }));
  }

  async function saveRecord(event) {
    event.preventDefault();
    setSavingRecord(true);
    setFormMessage("");
    const payload = Object.fromEntries(RECORD_FIELDS.map((field) => [field, recordForm[field]]));
    try {
      await apiRequest(
        editingId ? `/api/registros/${encodeURIComponent(editingId)}` : "/api/registros",
        user,
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }
      );
      await reloadEntries();
      entryDialog.current?.close();
      notify(editingId ? "Actividad actualizada." : "Actividad guardada.");
    } catch (error) {
      setFormMessage(error.message);
    } finally {
      setSavingRecord(false);
    }
  }

  function openDeleteRecord(id) {
    setPendingDeleteId(id);
    deleteDialog.current?.showModal();
  }

  async function deleteRecord() {
    if (!pendingDeleteId) return;
    setDeletingRecord(true);
    try {
      await apiRequest(`/api/registros/${encodeURIComponent(pendingDeleteId)}`, user, {
        method: "DELETE"
      });
      await reloadEntries();
      deleteDialog.current?.close();
      notify("Registro eliminado.");
    } catch (error) {
      deleteDialog.current?.close();
      notify(error.message, true);
    } finally {
      setPendingDeleteId(null);
      setDeletingRecord(false);
    }
  }

  function clearFilters() {
    setSearch("");
    setMonthFilter("");
    setDayFilter(localDate());
  }

  async function exportMonth() {
    if (!monthFilter || !hasMonthlyEntries) return;
    try {
      const headers = new Headers();
      headers.set("Authorization", `Bearer ${await user.getIdToken()}`);
      const response = await fetch(
        `/api/registros/exportar?mes=${encodeURIComponent(monthFilter)}`,
        { headers }
      );
      if (!response.ok) {
        let errorMessage = "No se pudo exportar el archivo.";
        try {
          const error = await response.json();
          errorMessage = error.message || errorMessage;
        } catch {
          errorMessage = "No se pudo exportar el archivo.";
        }
        throw new Error(errorMessage);
      }
      const file = await response.blob();
      const downloadUrl = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `bitacora_${monthFilter}.xlsx`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      notify(`Archivo Excel de ${monthFilter} descargado.`);
    } catch (error) {
      notify(error.message, true);
    }
  }

  const selectedDayHasEntries = entries.some((entry) => entry.fecha === dayFilter);
  const emptyMessage = loadingEntries
    ? "Cargando registros…"
    : loadError
      ? `No se pudieron cargar los registros: ${loadError}`
      : entries.length === 0
        ? "Todavía no hay actividades. Usa «Registrar actividad» para agregar la primera."
        : dayFilter && !monthFilter && !selectedDayHasEntries
          ? `No hay registros para ${formatDate(dayFilter)}. Los de otras fechas siguen guardados; elige otro día o un mes para consultarlos.`
          : "No se encontraron registros con esos filtros.";

  return (
    <>
      <header className="topbar">
        <a className="brand" href="/" aria-label="Bitácora, inicio">
          <span className="brand-icon" aria-hidden="true">B</span>
          <span>BITÁCORA<small>CONTROL DE ACTIVIDADES</small></span>
        </a>
        <div className="topbar-right">
          <span className="today">{todayLabel}</span>
          {user && <span className="account-email">{user.email}</span>}
          {user && (
            <button className="button button-light" type="button" onClick={handleLogout} disabled={signingOut}>
              Cerrar sesión
            </button>
          )}
          {user && (
            <button className="button button-primary" type="button" onClick={openNewRecord}>
              <span aria-hidden="true">＋</span> Registrar actividad
            </button>
          )}
        </div>
      </header>

      {!authReady ? (
        <section className="auth-panel" aria-live="polite">
          <div className="auth-card" role="status">
            <p className="eyebrow"><span className="eyebrow-dot" /> FIREBASE AUTHENTICATION</p>
            <h1>Verificando sesión…</h1>
            <p>Un momento, estamos comprobando si ya has iniciado sesión.</p>
          </div>
        </section>
      ) : !user ? (
        <section className="auth-panel" aria-live="polite">
          <div className="auth-card">
            <p className="eyebrow"><span className="eyebrow-dot" /> FIREBASE AUTHENTICATION</p>
            <h1>Bitácora de actividades</h1>
            <p>Inicia sesión con tu cuenta autorizada para consultar y administrar los registros.</p>
            <p className="form-message auth-message is-error" role="status" aria-live="polite">{authMessage}</p>
            <form className="auth-form" onSubmit={handleLogin}>
              <div className="field">
                <label htmlFor="auth-email">Correo electrónico</label>
                <input
                  id="auth-email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  disabled={!auth || signingIn}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="auth-password">Contraseña</label>
                <input
                  id="auth-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  disabled={!auth || signingIn}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <button className="button button-primary" type="submit" disabled={!auth || signingIn}>
                {signingIn ? "Iniciando sesión…" : "Iniciar sesión"}
              </button>
            </form>
          </div>
        </section>
      ) : (
        <main className="page">
          <section className="page-heading">
            <div>
              <p className="eyebrow"><span className="eyebrow-dot" /> REGISTRO DE TIEMPO</p>
              <h1>Actividades <span>y horas</span></h1>
              <p className="subtitle">Organiza tu jornada y consulta el tiempo dedicado a cada proyecto.</p>
            </div>
            <div className="summary" aria-label="Resumen de registros">
              <article className="summary-card summary-hours">
                <span>TIEMPO REGISTRADO</span>
                <strong>{formatHours(totalHours)} <small>h</small></strong>
              </article>
              <article className="summary-card"><span>REGISTROS</span><strong>{visibleEntries.length}</strong></article>
              <article className="summary-card"><span>CLIENTES</span><strong>{clients.size}</strong></article>
            </div>
          </section>

          <section className="important-notes" aria-labelledby="notes-title">
            <div className="notes-heading">
              <p className="eyebrow"><span className="eyebrow-dot" /> ANTES DE PREPARAR TU REPORTE</p>
              <h2 id="notes-title">Aspectos importantes <span>sobre las bitácoras</span></h2>
            </div>
            <ol className="note-grid">
              <li className="note-card">
                <span className="note-number" aria-hidden="true">1</span>
                <p><strong>Periodicidad del envío.</strong> Sigue las indicaciones de tu Delivery Manager (DM); el envío puede ser semanal o mensual.</p>
              </li>
              <li className="note-card note-card-blue">
                <span className="note-number" aria-hidden="true">2</span>
                <p><strong>Correo de envío.</strong> Envía la bitácora a <a href="mailto:bitacoras@crnova.com">bitacoras@crnova.com</a> y copia a tu DM.</p>
              </li>
              <li className="note-card">
                <span className="note-number" aria-hidden="true">3</span>
                <p><strong>Horas diarias.</strong> La jornada depende de la naturaleza del cliente: puede ser de 8, 8.5 horas u otro horario especial.</p>
              </li>
              <li className="note-card note-card-blue">
                <span className="note-number" aria-hidden="true">4</span>
                <p><strong>Un periodo por plantilla.</strong> Usa el rango acordado con el cliente o un mes específico. No mezcles varios periodos en una misma plantilla.</p>
              </li>
            </ol>
          </section>

          <section className="records-panel" aria-labelledby="records-title">
            <p className={`page-message${pageMessageIsError ? " is-error" : ""}`} role="status" aria-live="polite">
              {pageMessage}
            </p>
            <div className="records-toolbar">
              <div className="records-title">
                <h2 id="records-title">Detalle de actividades</h2>
                <span className="record-counter">
                  {visibleEntries.length} {visibleEntries.length === 1 ? "registro" : "registros"}
                </span>
              </div>
              <div className="filters">
                <label className="search-box">
                  <span aria-hidden="true">⌕</span>
                  <input
                    type="search"
                    placeholder="Buscar consultor, cliente o proyecto"
                    aria-label="Buscar registros"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </label>
                <label className="month-filter">
                  <span>Día</span>
                  <input
                    type="date"
                    aria-label="Filtrar por día"
                    value={dayFilter}
                    onChange={(event) => {
                      setDayFilter(event.target.value);
                      if (event.target.value) setMonthFilter("");
                    }}
                  />
                </label>
                <label className="month-filter">
                  <span>Mes</span>
                  <input
                    type="month"
                    aria-label="Filtrar por mes"
                    value={monthFilter}
                    onChange={(event) => {
                      setMonthFilter(event.target.value);
                      if (event.target.value) setDayFilter("");
                    }}
                  />
                </label>
                <button
                  className="button button-export"
                  type="button"
                  disabled={!hasMonthlyEntries}
                  title={!monthFilter
                    ? "Selecciona un mes para exportar"
                    : hasMonthlyEntries
                      ? `Descargar registros de ${monthFilter} en Excel`
                      : "No hay registros para el mes seleccionado"}
                  onClick={exportMonth}
                >
                  ⇩ Exportar Excel
                </button>
                <button
                  className="button button-light"
                  type="button"
                  title="Volver a los registros de hoy"
                  onClick={clearFilters}
                >
                  Hoy
                </button>
              </div>
            </div>

            <div className="table-wrap">
              <table className="records-table">
                <thead>
                  <tr>
                    <th scope="col">Consultor</th>
                    <th scope="col">Fecha</th>
                    <th scope="col">Cliente</th>
                    <th scope="col">Proyecto / Requerimiento</th>
                    <th scope="col">País</th>
                    <th scope="col">Actividad</th>
                    <th scope="col">Descripción</th>
                    <th scope="col">Hora inicio</th>
                    <th scope="col">Hora fin</th>
                    <th scope="col" className="time-heading">Tiempo</th>
                    <th scope="col" className="actions-heading"><span className="visually-hidden">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedEntries.length === 0 ? (
                    <tr><td className="empty-cell" colSpan={11}>{emptyMessage}</td></tr>
                  ) : paginatedEntries.map((entry) => (
                    <tr className={activityClass(entry.actividad)} key={entry.id}>
                      <td>{entry.consultor}</td>
                      <td>{formatDate(entry.fecha)}</td>
                      <td className="cell-strong">{entry.cliente}</td>
                      <td>{entry.proyecto}</td>
                      <td>{entry.pais}</td>
                      <td>{entry.actividad}</td>
                      <td className="description-cell">{entry.descripcion}</td>
                      <td className="time-cell">{entry.horaInicio}</td>
                      <td className="time-cell">{entry.horaFin}</td>
                      <td className="time-cell duration-cell">
                        {Number(entry.tiempo) === 0 ? "—" : formatHours(entry.tiempo)}
                      </td>
                      <td className="row-actions">
                        <button
                          className="icon-button"
                          type="button"
                          aria-label={`Editar registro de ${entry.consultor}, ${formatDate(entry.fecha)}`}
                          onClick={() => openEditRecord(entry)}
                        >
                          Editar
                        </button>
                        <button
                          className="icon-button delete-action"
                          type="button"
                          aria-label={`Eliminar registro de ${entry.consultor}, ${formatDate(entry.fecha)}`}
                          onClick={() => openDeleteRecord(entry.id)}
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {visibleEntries.length > PAGE_SIZE && (
              <nav className="pagination" aria-label="Paginación de registros">
                <button
                  className="pagination-button"
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                >
                  ← Anterior
                </button>
                <span className="pagination-status">
                  {firstVisibleRow}-{lastVisibleRow} de {visibleEntries.length} · Página {currentPage} de {totalPages}
                </span>
                <button
                  className="pagination-button"
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                >
                  Siguiente →
                </button>
              </nav>
            )}
            <p className="table-note">El tiempo se calcula automáticamente según las horas de inicio y fin.</p>
          </section>
        </main>
      )}

      <footer className="footer">
        <span>BITÁCORA · CONTROL DE ACTIVIDADES</span>
        <span>Desarrollado por Ing Héctor E Ramirez</span>
        <span>Los registros se guardan en Cloud Firestore.</span>
      </footer>

      <dialog
        className="entry-dialog"
        ref={entryDialog}
        aria-labelledby="dialog-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        <form className="entry-form" onSubmit={saveRecord}>
          <div className="dialog-heading">
            <div>
              <p className="eyebrow">DETALLE DE JORNADA</p>
              <h2 id="dialog-title">{editingId ? "Editar actividad" : "Nueva actividad"}</h2>
            </div>
            <button
              className="close-button"
              type="button"
              aria-label="Cerrar"
              onClick={() => entryDialog.current?.close()}
            >
              ×
            </button>
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="consultor">Consultor</label>
              <input
                id="consultor"
                name="consultor"
                value={recordForm.consultor}
                maxLength={100}
                placeholder="Nombre del consultor"
                required
                onChange={updateRecordField}
              />
            </div>
            <div className="field">
              <label htmlFor="fecha">Fecha</label>
              <input id="fecha" name="fecha" type="date" value={recordForm.fecha} required onChange={updateRecordField} />
            </div>
            <div className="field">
              <label htmlFor="cliente">Cliente</label>
              <select id="cliente" name="cliente" value={recordForm.cliente} required onChange={updateRecordField}>
                <option value="BCT">BCT</option>
                <option value="Novacomp">Novacomp</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="proyecto">Proyecto / Requerimiento</label>
              <input
                id="proyecto"
                name="proyecto"
                value={recordForm.proyecto}
                maxLength={160}
                placeholder="Ej. KASH / MSN-3012"
                required
                onChange={updateRecordField}
              />
            </div>
            <div className="field">
              <label htmlFor="pais">País</label>
              <input
                id="pais"
                name="pais"
                value={recordForm.pais}
                maxLength={100}
                placeholder="País"
                required
                onChange={updateRecordField}
              />
            </div>
            <div className="field">
              <label htmlFor="actividad">Actividad</label>
              <select id="actividad" name="actividad" value={recordForm.actividad} required onChange={updateRecordField}>
                {ACTIVITIES.map((activity) => <option key={activity}>{activity}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="horaInicio">Hora inicio</label>
              <input
                id="horaInicio"
                name="horaInicio"
                type="time"
                value={recordForm.horaInicio}
                required
                onChange={updateRecordField}
              />
            </div>
            <div className="field">
              <label htmlFor="horaFin">Hora fin</label>
              <input
                id="horaFin"
                name="horaFin"
                type="time"
                value={recordForm.horaFin}
                required
                onChange={updateRecordField}
              />
            </div>
            <div className="field field-wide">
              <label htmlFor="descripcion">Descripción</label>
              <textarea
                id="descripcion"
                name="descripcion"
                value={recordForm.descripcion}
                maxLength={1000}
                rows={3}
                placeholder="Describe la actividad realizada"
                required
                onChange={updateRecordField}
              />
            </div>
          </div>
          <p className={`form-message${formMessage ? " is-error" : ""}`} role="status" aria-live="polite">
            {formMessage}
          </p>
          <div className="dialog-actions">
            <button className="button button-light" type="button" onClick={() => entryDialog.current?.close()}>
              Cancelar
            </button>
            <button className="button button-primary" type="submit" disabled={savingRecord}>
              {savingRecord ? "Guardando…" : editingId ? "Guardar cambios" : "Guardar registro"}
            </button>
          </div>
        </form>
      </dialog>

      <dialog
        className="confirm-dialog"
        ref={deleteDialog}
        aria-labelledby="delete-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            setPendingDeleteId(null);
            event.currentTarget.close();
          }
        }}
        onClose={() => setPendingDeleteId(null)}
      >
        <div className="confirm-content">
          <p className="eyebrow">CONFIRMAR ACCIÓN</p>
          <h2 id="delete-title">¿Eliminar este registro?</h2>
          <p>Esta acción no se puede deshacer.</p>
          <div className="dialog-actions">
            <button
              className="button button-light"
              type="button"
              onClick={() => {
                setPendingDeleteId(null);
                deleteDialog.current?.close();
              }}
            >
              Cancelar
            </button>
            <button className="button button-danger" type="button" disabled={deletingRecord} onClick={deleteRecord}>
              {deletingRecord ? "Eliminando…" : "Eliminar"}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
