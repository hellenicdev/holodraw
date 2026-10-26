const ROOM_ID = /^[a-f0-9]{32}$/;

export function normalizeRoomId(value) {
  if (typeof value !== 'string') return null;
  const id = value.trim().toLowerCase();
  return ROOM_ID.test(id) ? id : null;
}
