export type StoreAdminRole = "owner" | "admin" | "staff";
export const ADMIN_VIEWS = [
  "dashboard",
  "orders",
  "products",
  "collections",
  "inventory",
  "promos",
  "reviews",
  "history",
  "team",
  "account",
] as const;
export type AdminView = (typeof ADMIN_VIEWS)[number];
export function permittedViews(role: StoreAdminRole): readonly AdminView[] {
  if (role === "owner") return ADMIN_VIEWS;
  if (role === "admin") return ADMIN_VIEWS.filter((view) => view !== "team");
  return ["inventory", "account"];
}
