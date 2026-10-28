// Parser for Joplin's raw sync items (the <id>.md files Joplin writes to its sync target).
//
// Layout, as written by Joplin's BaseItem.serialize:
//   <title>
//   <blank line>
//   <body ...>            (notes only; may contain blank lines)
//   <blank line>
//   key: value            (metadata, one per line, newlines in values escaped as \n)
//   ...
//   type_: 1
//
// The metadata block is read from the bottom up until the first blank line, so blank lines in the
// body are never mistaken for the separator.

export const ItemType = { Note: 1, Folder: 2 } as const;

export interface JoplinItem {
  id: string;
  type: number;
  title: string;
  body: string;
  parentId: string;
  createdTime: string | null;
  updatedTime: string | null;
  userCreatedTime: string | null;
  isConflict: boolean;
  encrypted: boolean;
  props: Record<string, string>;
}

const PROP_LINE = /^([a-z_]+):\s?(.*)$/;

function unescapeValue(value: string): string {
  return value.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
}

/** Joplin writes ISO timestamps; older items can hold epoch milliseconds. Returns ISO or null. */
function normalizeTime(value: string | undefined): string | null {
  if (!value) return null;
  if (/^\d+$/.test(value)) {
    const ms = Number(value);
    return ms > 0 ? new Date(ms).toISOString() : null;
  }
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export function parseJoplinItem(raw: string): JoplinItem {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();

  const props: Record<string, string> = {};
  let i = lines.length - 1;
  for (; i >= 0; i--) {
    const line = lines[i];
    if (line.trim() === "") break;
    const m = PROP_LINE.exec(line);
    if (!m) throw new Error(`Not a Joplin item: unexpected metadata line "${line.slice(0, 60)}"`);
    props[m[1]] = unescapeValue(m[2]);
  }
  if (!props.id || !props.type_) throw new Error("Not a Joplin item: missing id or type_");

  const content = lines.slice(0, Math.max(i, 0));
  const title = content.length ? content[0] : "";
  // Content is: title, blank line, body. Drop the title and the single separator line.
  const body = content.slice(2).join("\n");

  return {
    id: props.id,
    type: Number(props.type_),
    title,
    body,
    parentId: props.parent_id ?? "",
    createdTime: normalizeTime(props.created_time),
    updatedTime: normalizeTime(props.updated_time),
    userCreatedTime: normalizeTime(props.user_created_time),
    isConflict: props.is_conflict === "1",
    encrypted: props.encryption_applied === "1",
    props,
  };
}

/** Joplin's sync items are 32-hex-character ids with a .md extension at the folder root. */
export function isItemFileName(name: string): boolean {
  return /^[0-9a-f]{32}\.md$/i.test(name);
}

export function idFromFileName(name: string): string {
  return name.slice(0, 32).toLowerCase();
}
