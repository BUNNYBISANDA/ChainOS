const modules = [
  { name: "Catalog", desc: "Products, categories, UOM" },
  { name: "Procurement", desc: "Suppliers, purchase orders" },
  { name: "Inventory", desc: "Warehouses, stock ledger" },
  { name: "Fulfillment", desc: "Customer orders, reservations" },
  { name: "Logistics", desc: "Shipments, tracking events" },
];

export default function Home() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "4rem 1.5rem" }}>
      <p style={{ fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--accent)", margin: 0 }}>
        Phase 0 scaffold
      </p>
      <h1 style={{ fontSize: "2rem", margin: "0.4rem 0 0.75rem" }}>ChainOS</h1>
      <p style={{ color: "var(--ink-soft)", maxWidth: "60ch" }}>
        This placeholder confirms the app boots against the API. The real
        dashboard — live shipment tracking, inventory views, PO pipeline —
        is phase 3 (see the manifest). Nothing here is meant to be final UI.
      </p>
      <ul style={{ listStyle: "none", padding: 0, marginTop: "2rem", display: "grid", gap: "0.75rem" }}>
        {modules.map((m) => (
          <li
            key={m.name}
            style={{
              border: "1px solid var(--line)",
              padding: "0.9rem 1.1rem",
              display: "flex",
              justifyContent: "space-between",
              gap: "1rem",
            }}
          >
            <strong>{m.name}</strong>
            <span style={{ color: "var(--ink-soft)" }}>{m.desc}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
