/**
 * Sección Eventos: dinámicas con retos diarios (por ejemplo, rumbo a Wild Area).
 *
 * Participan los miembros activos de Escama Esmeralda que tienen su cuenta de la web
 * aprobada y vinculada (el administrador vincula cada miembro de Escama con su cuenta).
 * Cada quien sube la captura del reto cumplido; al aprobarla, suma los puntos del reto.
 * La captura se borra al revisarla para que la base de datos no se llene.
 */
import { caracasToday, escamaMembers } from './_escama.js';
import { DbError, newId, run } from './_miembros.js';

// Las dinámicas terminadas siguen visibles 2 semanas, para ver la tabla final
const DAYS_VISIBLE_AFTER_END = 14;

const bool = (v) => v === true || v === 't' || v === 'true';
const day = (v) => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);

function challengeState(reto, today) {
  if (today < reto.inicio) return 'proximo';
  if (today > reto.fin) return 'cerrado';
  return 'abierto';
}

function toChallenge(row, today) {
  const reto = {
    id: row.id,
    dinamicaId: row.dinamica_id,
    titulo: row.titulo,
    descripcion: row.descripcion,
    puntos: Number(row.puntos),
    inicio: day(row.inicio),
    fin: day(row.fin),
  };
  return { ...reto, estado: challengeState(reto, today) };
}

function toDynamic(row) {
  return { id: row.id, nombre: row.nombre, descripcion: row.descripcion, inicio: day(row.inicio), fin: day(row.fin) };
}

/** Cuentas que pueden participar: vinculadas a un miembro activo de Escama y aprobadas */
export async function participants() {
  const [members, links] = await Promise.all([
    escamaMembers(),
    run((sql) =>
      sql.query(
        `SELECT v.escama_id, c.id, c.avatar, c.shiny, c.equipo, m.entrenador
         FROM escama_vinculos v JOIN cuentas c ON c.id = v.cuenta_id JOIN miembros m ON m.id = c.miembro_id
         WHERE c.estado = 'aprobada'`,
      ),
    ),
  ]);
  const active = new Set(members.filter((m) => m.activo).map((m) => m.id));
  return links
    .filter((l) => active.has(l.escama_id))
    .map((l) => ({ id: l.id, entrenador: l.entrenador, avatar: Number(l.avatar), shiny: bool(l.shiny), equipo: l.equipo }));
}

/**
 * Lo que ve todo el mundo en /eventos: dinámicas vigentes, sus retos ya publicados y la
 * tabla de puntos. Con cuentaId, también si esa cuenta participa y cómo van sus entregas.
 */
export async function publicView(cuentaId) {
  const today = caracasToday();
  const [dynamics, people] = await Promise.all([
    run((sql) =>
      sql.query(`SELECT * FROM dinamicas WHERE fin >= ($1::date - $2::integer) ORDER BY inicio DESC LIMIT 5`, [today, DAYS_VISIBLE_AFTER_END]),
    ),
    participants(),
  ]);
  if (!dynamics.length) return { hoy: today, dinamicas: [], participa: people.some((p) => p.id === cuentaId) };

  const ids = dynamics.map((d) => d.id);
  const [challenges, points, mine] = await run((sql) =>
    Promise.all([
      // Los retos aparecen desde el día en que empiezan: el equipo puede dejarlos listos antes
      sql.query(`SELECT * FROM retos WHERE dinamica_id = ANY($1::text[]) AND inicio <= $2::date ORDER BY inicio DESC, creado DESC`, [ids, today]),
      sql.query(
        `SELECT r.dinamica_id, e.cuenta_id, sum(r.puntos)::integer AS puntos, count(*)::integer AS retos
         FROM entregas e JOIN retos r ON r.id = e.reto_id
         WHERE e.estado = 'aprobada' AND r.dinamica_id = ANY($1::text[])
         GROUP BY r.dinamica_id, e.cuenta_id`,
        [ids],
      ),
      cuentaId
        ? sql.query(`SELECT e.reto_id, e.estado, e.nota FROM entregas e JOIN retos r ON r.id = e.reto_id WHERE e.cuenta_id = $1 AND r.dinamica_id = ANY($2::text[])`, [
            cuentaId,
            ids,
          ])
        : [],
    ]),
  );

  const dinamicas = dynamics.map((row) => {
    const dynamic = toDynamic(row);
    const scores = new Map(points.filter((p) => p.dinamica_id === dynamic.id).map((p) => [p.cuenta_id, p]));
    const ranking = people
      .map((p) => ({ ...p, puntos: Number(scores.get(p.id)?.puntos ?? 0), retos: Number(scores.get(p.id)?.retos ?? 0) }))
      .sort((a, b) => b.puntos - a.puntos || a.entrenador.localeCompare(b.entrenador, 'es'));
    return {
      ...dynamic,
      retos: challenges.filter((c) => c.dinamica_id === dynamic.id).map((c) => toChallenge(c, today)),
      ranking,
    };
  });
  const entregas = Object.fromEntries(mine.map((e) => [e.reto_id, { estado: e.estado, nota: e.nota }]));
  return { hoy: today, dinamicas, participa: people.some((p) => p.id === cuentaId), entregas };
}

/** Por qué una cuenta no puede participar (o null si puede) */
export async function participationProblem(cuentaId) {
  const rows = await run((sql) => sql.query(`SELECT escama_id FROM escama_vinculos WHERE cuenta_id = $1`, [cuentaId]));
  if (!rows.length) return 'Tu cuenta todavía no está vinculada a Escama Esmeralda. Escríbele al equipo para que la vinculen.';
  const member = (await escamaMembers()).find((m) => m.id === rows[0].escama_id);
  if (!member?.activo) return 'Tu suscripción de Escama Esmeralda no está activa. Renuévala para participar.';
  return null;
}

export async function submit(cuentaId, retoId, captura) {
  const today = caracasToday();
  const problem = await participationProblem(cuentaId);
  if (problem) throw new DbError(403, problem);
  return run(async (sql) => {
    const rows = await sql.query(`SELECT * FROM retos WHERE id = $1`, [retoId]);
    if (!rows.length) throw new DbError(404, 'Ese reto ya no existe.');
    const reto = toChallenge(rows[0], today);
    if (reto.estado === 'proximo') throw new DbError(409, 'Ese reto todavía no empieza.');
    if (reto.estado === 'cerrado') throw new DbError(409, 'Ese reto ya cerró.');
    const existing = await sql.query(`SELECT estado FROM entregas WHERE reto_id = $1 AND cuenta_id = $2`, [retoId, cuentaId]);
    if (existing[0]?.estado === 'aprobada') throw new DbError(409, 'Este reto ya te lo aprobaron.');
    await sql.query(
      `INSERT INTO entregas (id, reto_id, cuenta_id, captura) VALUES ($1, $2, $3, $4)
       ON CONFLICT (reto_id, cuenta_id) DO UPDATE SET captura = excluded.captura, estado = 'pendiente', nota = '', creada = now(), revisada = NULL`,
      [newId(), retoId, cuentaId, captura],
    );
    return { estado: 'pendiente' };
  });
}

// ---------- Administración ----------

export async function adminDynamics() {
  const today = caracasToday();
  const [dynamics, challenges, counts] = await run((sql) =>
    Promise.all([
      sql.query(`SELECT * FROM dinamicas ORDER BY inicio DESC`),
      sql.query(`SELECT * FROM retos ORDER BY inicio, creado`),
      sql.query(`SELECT reto_id, estado, count(*)::integer AS total FROM entregas GROUP BY reto_id, estado`),
    ]),
  );
  return dynamics.map((row) => ({
    ...toDynamic(row),
    retos: challenges
      .filter((c) => c.dinamica_id === row.id)
      .map((c) => {
        const count = (estado) => Number(counts.find((n) => n.reto_id === c.id && n.estado === estado)?.total ?? 0);
        return { ...toChallenge(c, today), pendientes: count('pendiente'), aprobadas: count('aprobada'), rechazadas: count('rechazada') };
      }),
  }));
}

export async function saveDynamic(input) {
  const id = input.id || newId();
  await run((sql) =>
    sql.query(
      `INSERT INTO dinamicas (id, nombre, descripcion, inicio, fin) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET nombre = excluded.nombre, descripcion = excluded.descripcion, inicio = excluded.inicio, fin = excluded.fin`,
      [id, input.nombre, input.descripcion, input.inicio, input.fin],
    ),
  );
  return { id };
}

export async function deleteDynamic(id) {
  const rows = await run((sql) => sql.query(`DELETE FROM dinamicas WHERE id = $1 RETURNING id`, [id]));
  if (!rows.length) throw new DbError(404, 'Esa dinámica ya no existe.');
  return { id };
}

export async function saveChallenge(input) {
  const id = input.id || newId();
  await run(async (sql) => {
    const dynamic = await sql.query(`SELECT 1 FROM dinamicas WHERE id = $1`, [input.dinamicaId]);
    if (!dynamic.length) throw new DbError(404, 'Esa dinámica ya no existe.');
    await sql.query(
      `INSERT INTO retos (id, dinamica_id, titulo, descripcion, puntos, inicio, fin) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET titulo = excluded.titulo, descripcion = excluded.descripcion, puntos = excluded.puntos,
         inicio = excluded.inicio, fin = excluded.fin`,
      [id, input.dinamicaId, input.titulo, input.descripcion, input.puntos, input.inicio, input.fin],
    );
  });
  return { id };
}

export async function deleteChallenge(id) {
  const rows = await run((sql) => sql.query(`DELETE FROM retos WHERE id = $1 RETURNING id`, [id]));
  if (!rows.length) throw new DbError(404, 'Ese reto ya no existe.');
  return { id };
}

/** Capturas por revisar (sin la imagen, que se pide aparte) */
export async function pendingSubmissions() {
  const rows = await run((sql) =>
    sql.query(
      `SELECT e.id, e.creada, r.titulo AS reto, r.puntos, d.nombre AS dinamica, m.entrenador, c.avatar, c.shiny
       FROM entregas e
       JOIN retos r ON r.id = e.reto_id JOIN dinamicas d ON d.id = r.dinamica_id
       JOIN cuentas c ON c.id = e.cuenta_id JOIN miembros m ON m.id = c.miembro_id
       WHERE e.estado = 'pendiente' AND e.captura IS NOT NULL
       ORDER BY e.creada`,
    ),
  );
  return rows.map((r) => ({
    id: r.id,
    creada: new Date(r.creada).toISOString(),
    reto: r.reto,
    puntos: Number(r.puntos),
    dinamica: r.dinamica,
    entrenador: r.entrenador,
    avatar: Number(r.avatar),
    shiny: bool(r.shiny),
  }));
}

export async function submissionImage(id) {
  const rows = await run((sql) => sql.query(`SELECT captura FROM entregas WHERE id = $1`, [id]));
  if (!rows[0]?.captura) throw new DbError(404, 'Esa captura ya no está disponible.');
  return { base64: rows[0].captura };
}

export async function reviewSubmission(id, estado, nota) {
  if (!['aprobada', 'rechazada'].includes(estado)) throw new DbError(400, 'Estado no válido.');
  const rows = await run((sql) =>
    sql.query(`UPDATE entregas SET estado = $2, nota = $3, captura = NULL, revisada = now() WHERE id = $1 RETURNING id`, [id, estado, nota]),
  );
  if (!rows.length) throw new DbError(404, 'Esa entrega ya no existe.');
  return { id, estado };
}

/** Miembros de Escama con la cuenta vinculada y las cuentas aprobadas para elegir */
export async function escamaAdminView() {
  const [members, links, accounts] = await Promise.all([
    escamaMembers({ fresh: true }),
    run((sql) => sql.query(`SELECT escama_id, cuenta_id FROM escama_vinculos`)),
    run((sql) =>
      sql.query(
        `SELECT c.id, m.entrenador, m.nombre FROM cuentas c JOIN miembros m ON m.id = c.miembro_id WHERE c.estado = 'aprobada' ORDER BY lower(m.entrenador)`,
      ),
    ),
  ]);
  const linked = new Map(links.map((l) => [l.escama_id, l.cuenta_id]));
  return {
    miembros: members.map((m) => ({ ...m, cuentaId: linked.get(m.id) ?? null })),
    cuentas: accounts.map((a) => ({ id: a.id, entrenador: a.entrenador, nombre: a.nombre })),
  };
}

export async function linkEscama(escamaId, cuentaId) {
  await run(async (sql) => {
    if (!cuentaId) {
      await sql.query(`DELETE FROM escama_vinculos WHERE escama_id = $1`, [escamaId]);
      return;
    }
    // Una cuenta solo puede estar vinculada a un miembro de Escama
    await sql.query(`DELETE FROM escama_vinculos WHERE cuenta_id = $1 OR escama_id = $2`, [cuentaId, escamaId]);
    await sql.query(`INSERT INTO escama_vinculos (escama_id, cuenta_id) VALUES ($1, $2)`, [escamaId, cuentaId]);
  });
  return { escamaId, cuentaId: cuentaId || null };
}
