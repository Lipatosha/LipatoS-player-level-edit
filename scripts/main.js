const MODULE_ID = "lipatos-player-level-edit";
const LEGACY_SCOPE = "aindor-player-level-edit";
const FLAG_SCOPE = MODULE_ID;
const FLAG_KEY = "enabled";

function getActor(app) {
  return app?.actor ?? app?.document ?? null;
}

function isCharacterSheet(app) {
  const actor = getActor(app);
  if (!actor || actor.documentName !== "Actor" || actor.type !== "character") return false;
  if (game.user.isGM) return true;
  return actor.isOwner;
}

function isEnabled(actor) {
  const current = actor?.getFlag?.(FLAG_SCOPE, FLAG_KEY);
  if (current !== undefined) return current === true;
  return actor?.getFlag?.(LEGACY_SCOPE, FLAG_KEY) === true;
}

function getFeaturesTab(element) {
  return element?.querySelector?.('.tab[data-tab="features"]')
    ?? element?.querySelector?.('section[data-tab="features"]')
    ?? element?.querySelector?.('[data-application-part="features"]');
}

function getToggleHost(tab) {
  if (!tab) return null;

  const search =
    tab.querySelector('input[type="search"]')
    ?? tab.querySelector('input[placeholder*="особ" i]')
    ?? tab.querySelector('.filter-list')
    ?? tab.querySelector('.items-header');

  if (search) {
    const row =
      search.closest('.filter-list')
      ?? search.closest('.search-area')
      ?? search.closest('.items-header')
      ?? search.parentElement;

    if (row?.parentElement) return { parent: row.parentElement, before: row };
  }

  return { parent: tab, before: tab.firstElementChild };
}

function updateToggleVisual(app, toggle) {
  const actor = getActor(app);
  const editing = isEnabled(actor);
  const gm = game.user.isGM;

  toggle.setAttribute("aria-checked", String(editing));
  toggle.classList.toggle("active", editing);
  toggle.classList.toggle("gm-locked", !gm);

  if (gm) {
    toggle.title = editing
      ? "Завершить редактирование уровня"
      : "Разрешить игроку редактировать уровень";
  } else {
    toggle.title = editing
      ? "Редактирование уровня разрешено ГМ"
      : "Только ГМ может активировать";
  }

  const text = toggle.querySelector(".lipatos-level-edit-text");
  if (text) text.textContent = editing ? "Готово" : "Редактировать";
}

async function rerenderFeatures(app) {
  try {
    await app.render({ parts: ["features"] });
  } catch (err) {
    try {
      await app.render({ force: true });
    } catch (e) {
      console.warn(`${MODULE_ID} | Не удалось перерисовать вкладку`, e);
    }
  }
}

function buildToggle(app, tab) {
  if (!tab) return null;

  let toggle = tab.querySelector(".lipatos-level-edit-toggle");
  if (toggle) {
    updateToggleVisual(app, toggle);
    return toggle;
  }

  const host = getToggleHost(tab);
  if (!host?.parent) return null;

  const row = document.createElement("div");
  row.className = "lipatos-level-edit-row";

  toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "lipatos-level-edit-toggle";
  toggle.setAttribute("role", "switch");
  toggle.setAttribute("aria-label", "Редактировать уровень класса");
  toggle.innerHTML = `
    <span class="lipatos-level-edit-track" aria-hidden="true">
      <span class="lipatos-level-edit-knob"></span>
    </span>
    <span class="lipatos-level-edit-text">Редактировать</span>
  `;

  row.append(toggle);
  host.parent.insertBefore(row, host.before ?? null);

  updateToggleVisual(app, toggle);

  for (const eventName of ["pointerdown", "mousedown", "mouseup"]) {
    toggle.addEventListener(eventName, event => event.stopPropagation());
  }

  toggle.addEventListener("click", async event => {
    event.preventDefault();
    event.stopPropagation();

    if (!game.user.isGM) {
      ui.notifications.warn("Только ГМ может активировать.");
      return;
    }

    const actor = getActor(app);
    if (!actor) return;

    await actor.setFlag(FLAG_SCOPE, FLAG_KEY, !isEnabled(actor));

    if (actor.getFlag?.(LEGACY_SCOPE, FLAG_KEY) !== undefined) {
      await actor.unsetFlag(LEGACY_SCOPE, FLAG_KEY);
    }
  });

  return toggle;
}

Hooks.on("dnd5e.prepareSheetContext", (sheet, partId, context) => {
  try {
    if (partId !== "features") return;
    if (!isCharacterSheet(sheet)) return;

    context.editable = isEnabled(getActor(sheet));
  } catch (err) {
    console.error(`${MODULE_ID} | Ошибка подготовки features`, err);
  }
});

Hooks.on("renderApplicationV2", (app, element) => {
  try {
    if (!isCharacterSheet(app)) return;

    const root = element ?? app.element;
    const tab = getFeaturesTab(root);
    if (!tab) return;

    buildToggle(app, tab);
  } catch (err) {
    console.error(`${MODULE_ID} | Ошибка добавления тумблера`, err);
  }
});

Hooks.on("updateActor", (actor, changes) => {
  try {
    const changed =
      foundry.utils.hasProperty(changes, `flags.${FLAG_SCOPE}.${FLAG_KEY}`)
      || foundry.utils.hasProperty(changes, `flags.${FLAG_SCOPE}`)
      || foundry.utils.hasProperty(changes, `flags.${LEGACY_SCOPE}.${FLAG_KEY}`)
      || foundry.utils.hasProperty(changes, `flags.${LEGACY_SCOPE}`);

    if (!changed) return;
    if (actor.type !== "character") return;
    if (!game.user.isGM && !actor.isOwner) return;

    const sheet = actor.sheet;
    if (sheet?.rendered) rerenderFeatures(sheet);
  } catch (err) {
    console.error(`${MODULE_ID} | Ошибка синхронизации`, err);
  }
});

Hooks.once("ready", async () => {
  if (!game.user.isGM) return;

  for (const actor of game.actors ?? []) {
    if (actor.type !== "character") continue;

    const current = actor.getFlag?.(FLAG_SCOPE, FLAG_KEY);
    const legacy = actor.getFlag?.(LEGACY_SCOPE, FLAG_KEY);

    if (current === undefined && legacy !== undefined) {
      await actor.setFlag(FLAG_SCOPE, FLAG_KEY, legacy === true);
    }

    if (legacy !== undefined) {
      await actor.unsetFlag(LEGACY_SCOPE, FLAG_KEY);
    }
  }
});
