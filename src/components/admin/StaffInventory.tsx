import { useEffect, useState } from "react";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
export default function StaffInventory() {
  const [rows, setRows] = useState<
    { product: string; version: string; size: string; stock: number }[]
  >([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void supabaseAdmin.rpc("staff_inventory").then(({ data, error }) => {
      if (active) {
        if (error) setError("Could not load inventory.");
        else setRows(data ?? []);
      }
    });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section className="space-y-4">
      <h2 className="font-display text-2xl">Inventory  /  read only</h2>
      <p>Staff can check stock. Ask an administrator to make changes.</p>
      {error && <p role="alert">{error}</p>}
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="glass rounded-lg p-3">
            {row.product}  /  {row.version}  /  {row.size}
            <strong className="ml-3">{row.stock} in stock</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
