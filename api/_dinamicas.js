/**
 * Sección Eventos: dinámicas con retos diarios (por ejemplo, Wild Area).
 *
 * Participan los miembros activos de Escama Esmeralda que tienen su cuenta de la web
 * aprobada y vinculada. El vínculo lo hace el propio miembro validando su teléfono (el
 * mismo que tiene en Escama) o el administrador desde el panel.
 *
 * Dos tipos de reto:
 *   captura  el miembro sube la captura y el administrador la aprueba (la imagen se borra al revisarla)
 *   logro    el miembro toca "¡Lo logré!" (hasta el límite del reto) y el administrador lo
 *            valida en persona en la quedada; cada logro validado suma los puntos del reto
 */
import { caracasToday, escamaMembers, escamaPhoneProblem } from './_escama.js';
import { DbError, newId, normalizePhone, run } from './_miembros.js';

// Validaciones de teléfono fallidas que se permiten por hora y cuenta
const PHONE_TRIES_PER_HOUR = 6;

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
    modo: row.modo === 'logro' ? 'logro' : 'captura',
    // null: sin límite
    limite: row.limite === null || row.limite === undefined ? null : Number(row.limite),
    grupo: row.grupo ?? '',
    pokemon: String(row.pokemon ?? '')
      .split(',')
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0),
    orden: Number(row.orden ?? 0),
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
  const [challenges, points, mine, myClaims] = await run((sql) =>
    Promise.all([
      // Los retos con captura aparecen desde el día en que empiezan (el equipo puede dejarlos
      // listos antes); las misiones de "¡Lo logré!" se ven toda la semana para planificar
      sql.query(
        `SELECT * FROM retos WHERE dinamica_id = ANY($1::text[]) AND (inicio <= $2::date OR modo = 'logro') ORDER BY inicio, orden, creado`,
        [ids, today],
      ),
      // Puntos: capturas aprobadas y logros validados
      sql.query(
        `SELECT dinamica_id, cuenta_id, sum(puntos)::integer AS puntos, count(*)::integer AS retos FROM (
           SELECT r.dinamica_id, e.cuenta_id, r.puntos FROM entregas e JOIN retos r ON r.id = e.reto_id
           WHERE e.estado = 'aprobada' AND r.dinamica_id = ANY($1::text[])
           UNION ALL
           SELECT r.dinamica_id, l.cuenta_id, r.puntos FROM logros l JOIN retos r ON r.id = l.reto_id
           WHERE l.estado = 'aprobado' AND r.dinamica_id = ANY($1::text[])
         ) x GROUP BY dinamica_id, cuenta_id`,
        [ids],
      ),
      cuentaId
        ? sql.query(`SELECT e.reto_id, e.estado, e.nota FROM entregas e JOIN retos r ON r.id = e.reto_id WHERE e.cuenta_id = $1 AND r.dinamica_id = ANY($2::text[])`, [
            cuentaId,
            ids,
          ])
        : [],
      cuentaId
        ? sql.query(
            `SELECT l.reto_id, count(*) FILTER (WHERE l.estado = 'pendiente')::integer AS pendientes,
                    count(*) FILTER (WHERE l.estado = 'aprobado')::integer AS aprobados,
                    count(*) FILTER (WHERE l.estado = 'rechazado')::integer AS rechazados
             FROM logros l JOIN retos r ON r.id = l.reto_id
             WHERE l.cuenta_id = $1 AND r.dinamica_id = ANY($2::text[]) GROUP BY l.reto_id`,
            [cuentaId, ids],
          )
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
  const logros = Object.fromEntries(
    myClaims.map((l) => [l.reto_id, { pendientes: Number(l.pendientes), aprobados: Number(l.aprobados), rechazados: Number(l.rechazados) }]),
  );
  return { hoy: today, dinamicas, participa: people.some((p) => p.id === cuentaId), entregas, logros };
}

/** Por qué una cuenta no puede participar (o null si puede) */
export async function participationProblem(cuentaId) {
  const rows = await run((sql) => sql.query(`SELECT escama_id FROM escama_vinculos WHERE cuenta_id = $1`, [cuentaId]));
  if (!rows.length) {
    return escamaPhoneProblem()
      ? 'Tu cuenta todavía no está vinculada a Escama Esmeralda. Escríbele al equipo para que la vinculen.'
      : 'Valida tu suscripción de Escama Esmeralda con tu número de teléfono.';
  }
  const member = (await escamaMembers()).find((m) => m.id === rows[0].escama_id);
  if (!member?.activo) return 'Tu suscripción de Escama Esmeralda no está activa. Renuévala para participar.';
  return null;
}

/** El miembro de Escama con ese teléfono, si no está vinculado a otra cuenta */
async function linkByPhone(cuentaId, phone) {
  const member = (await escamaMembers()).find((m) => m.telefono && m.telefono === phone);
  if (!member) return { error: 'noEncontrado' };
  const taken = await run((sql) => sql.query(`SELECT cuenta_id FROM escama_vinculos WHERE escama_id = $1`, [member.id]));
  if (taken.length && taken[0].cuenta_id !== cuentaId) return { error: 'ocupado', member };
  if (!taken.length) {
    await run(async (sql) => {
      await sql.query(`DELETE FROM escama_vinculos WHERE cuenta_id = $1`, [cuentaId]);
      await sql.query(`INSERT INTO escama_vinculos (escama_id, cuenta_id) VALUES ($1, $2)`, [member.id, cuentaId]);
    });
  }
  return { member };
}

/**
 * Si el teléfono con el que se registró en Emerald City es el mismo que tiene en Escama,
 * la cuenta se vincula sola, sin pedirle nada.
 */
export async function autoLinkByPhone(cuentaId) {
  if (escamaPhoneProblem()) return false;
  const linked = await run((sql) => sql.query(`SELECT 1 FROM escama_vinculos WHERE cuenta_id = $1`, [cuentaId]));
  if (linked.length) return false;
  const rows = await run((sql) =>
    sql.query(`SELECT m.telefono FROM cuentas c JOIN miembros m ON m.id = c.miembro_id WHERE c.id = $1`, [cuentaId]),
  );
  const phone = normalizePhone(rows[0]?.telefono);
  if (!phone) return false;
  const result = await linkByPhone(cuentaId, phone);
  return Boolean(result.member && !result.error);
}

/** El miembro escribe su teléfono para validar que es parte de Escama Esmeralda */
export async function validatePhone(cuentaId, telefono) {
  const problem = escamaPhoneProblem();
  if (problem) throw new DbError(503, `La validación con teléfono no está disponible todavía. ${problem}`);
  const tries = await run((sql) =>
    sql.query(`SELECT count(*)::integer AS total FROM escama_intentos WHERE cuenta_id = $1 AND creado > now() - interval '1 hour'`, [cuentaId]),
  );
  if (Number(tries[0].total) >= PHONE_TRIES_PER_HOUR) throw new DbError(429, 'Hiciste muchos intentos. Espera una hora o escríbele al equipo por WhatsApp.');
  const phone = normalizePhone(telefono);
  if (!phone) throw new DbError(400, 'Escribe tu número completo, por ejemplo 0412 1234567.');

  const result = await linkByPhone(cuentaId, phone);
  if (result.error) {
    await run((sql) => sql.query(`INSERT INTO escama_intentos (cuenta_id) VALUES ($1)`, [cuentaId]));
    if (result.error === 'ocupado') throw new DbError(409, 'Ese número ya está vinculado a otra cuenta del foro. Si es tuyo, escríbele al equipo por WhatsApp.');
    throw new DbError(404, 'Ese número no aparece en Escama Esmeralda. Revisa que sea el mismo con el que te inscribiste.');
  }
  if (!result.member.activo) {
    throw new DbError(403, `Encontramos tu inscripción, pero tu suscripción de Escama Esmeralda no está activa${result.member.venc ? ` (venció el ${result.member.venc.split('-').reverse().join('/')})` : ''}. Renuévala para participar.`);
  }
  return { ok: true };
}

// ---------- "¡Lo logré!" ----------

async function openLogro(sql, retoId) {
  const rows = await sql.query(`SELECT * FROM retos WHERE id = $1`, [retoId]);
  if (!rows.length) throw new DbError(404, 'Esa misión ya no existe.');
  const reto = toChallenge(rows[0], caracasToday());
  if (reto.modo !== 'logro') throw new DbError(400, 'Esa misión se completa subiendo la captura.');
  if (reto.estado === 'proximo') throw new DbError(409, 'Esa misión todavía no empieza: es de otro día.');
  if (reto.estado === 'cerrado') throw new DbError(409, 'Esa misión ya cerró.');
  return reto;
}

/** Marca un logro (queda pendiente hasta que el administrador lo valida en persona) */
export async function claim(cuentaId, retoId) {
  const problem = await participationProblem(cuentaId);
  if (problem) throw new DbError(403, problem);
  return run(async (sql) => {
    const reto = await openLogro(sql, retoId);
    const used = await sql.query(`SELECT count(*)::integer AS total FROM logros WHERE reto_id = $1 AND cuenta_id = $2 AND estado <> 'rechazado'`, [retoId, cuentaId]);
    if (reto.limite !== null && Number(used[0].total) >= reto.limite) {
      throw new DbError(409, `Ya llegaste al límite de esta misión (${reto.limite}).`);
    }
    await sql.query(`INSERT INTO logros (id, reto_id, cuenta_id) VALUES ($1, $2, $3)`, [newId(), retoId, cuentaId]);
    return { ok: true };
  });
}

/** Deshace el último "¡Lo logré!" que todavía no se validó (por si se tocó sin querer) */
export async function undoClaim(cuentaId, retoId) {
  const rows = await run((sql) =>
    sql.query(
      `DELETE FROM logros WHERE id = (SELECT id FROM logros WHERE reto_id = $1 AND cuenta_id = $2 AND estado = 'pendiente' ORDER BY creado DESC LIMIT 1) RETURNING id`,
      [retoId, cuentaId],
    ),
  );
  if (!rows.length) throw new DbError(409, 'No tienes logros por validar en esta misión.');
  return { ok: true };
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
      sql.query(`SELECT * FROM retos ORDER BY inicio, orden, creado`),
      sql.query(
        `SELECT reto_id, estado, count(*)::integer AS total FROM (
           SELECT reto_id, estado FROM entregas
           UNION ALL
           SELECT reto_id, CASE estado WHEN 'aprobado' THEN 'aprobada' WHEN 'rechazado' THEN 'rechazada' ELSE estado END FROM logros
         ) x GROUP BY reto_id, estado`,
      ),
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
    // El teléfono nunca sale del servidor: solo se dice si Escama lo tiene
    miembros: members.map(({ telefono, ...m }) => ({ ...m, conTelefono: Boolean(telefono), cuentaId: linked.get(m.id) ?? null })),
    telefonos: escamaPhoneProblem(),
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

// ---------- Logros por validar (administrador) ----------

/** Logros pendientes con quién los marcó y de qué misión, los más recientes primero */
export async function pendingClaims() {
  const rows = await run((sql) =>
    sql.query(
      `SELECT l.id, l.creado, l.cuenta_id, r.titulo, r.puntos, r.inicio, r.grupo, r.pokemon, d.nombre AS dinamica,
              m.entrenador, c.avatar, c.shiny
       FROM logros l
       JOIN retos r ON r.id = l.reto_id JOIN dinamicas d ON d.id = r.dinamica_id
       JOIN cuentas c ON c.id = l.cuenta_id JOIN miembros m ON m.id = c.miembro_id
       WHERE l.estado = 'pendiente'
       ORDER BY lower(m.entrenador), l.creado`,
    ),
  );
  return rows.map((r) => ({
    id: r.id,
    creado: new Date(r.creado).toISOString(),
    cuentaId: r.cuenta_id,
    mision: r.titulo,
    puntos: Number(r.puntos),
    dia: day(r.inicio),
    grupo: r.grupo ?? '',
    pokemon: Number(String(r.pokemon ?? '').split(',')[0]) || null,
    dinamica: r.dinamica,
    entrenador: r.entrenador,
    avatar: Number(r.avatar),
    shiny: bool(r.shiny),
  }));
}

/** Valida o rechaza logros (uno o varios a la vez) */
export async function reviewClaims(ids, estado) {
  if (!['aprobado', 'rechazado'].includes(estado)) throw new DbError(400, 'Estado no válido.');
  const rows = await run((sql) =>
    sql.query(`UPDATE logros SET estado = $2, revisado = now() WHERE id = ANY($1::text[]) AND estado = 'pendiente' RETURNING id`, [ids, estado]),
  );
  return { revisados: rows.length };
}

/** Crea la dinámica de Wild Area con todas sus misiones, a partir del lunes indicado */
export async function loadTemplate(template) {
  const id = newId();
  await run(async (sql) => {
    await sql.query(`INSERT INTO dinamicas (id, nombre, descripcion, inicio, fin) VALUES ($1, $2, $3, $4, $5)`, [
      id,
      template.nombre,
      template.descripcion,
      template.inicio,
      template.fin,
    ]);
    for (const [i, reto] of template.retos.entries()) {
      await sql.query(
        `INSERT INTO retos (id, dinamica_id, titulo, descripcion, puntos, inicio, fin, modo, limite, grupo, pokemon, orden)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'logro', $8, $9, $10, $11)`,
        [newId(), id, reto.titulo, reto.descripcion ?? '', reto.puntos, reto.inicio, reto.fin, reto.limite ?? null, reto.grupo ?? '', reto.pokemon.join(','), i],
      );
    }
  });
  return { id, retos: template.retos.length };
}
