// Tests that log in as the API's own role (jonz_api) give it a throwaway
// password for the file. Afterwards it gets back the password the stack was
// given (API_DATABASE_URL, which the server's own client logs in with), so
// the files after this one can still reach the database as the server.

/** Puts jonz_api's password back as API_DATABASE_URL has it, or none. */
export function restoreApiRole(admin: { unsafe: (query: string) => PromiseLike<unknown> }) {
  const url = process.env.API_DATABASE_URL;
  const password = url ? decodeURIComponent(new URL(url).password) : "";
  return admin.unsafe(password ? `alter role jonz_api password '${password.replace(/'/g, "''")}'` : `alter role jonz_api password null`);
}
