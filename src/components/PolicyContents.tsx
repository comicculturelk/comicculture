export default function PolicyContents({ sections, prefix }: { sections: { title: string }[]; prefix: string }) {
  return <details className="mb-6 rounded-xl border border-border bg-surface p-4">
    <summary className="cursor-pointer py-1 text-sm font-semibold">Jump to a section</summary>
    <nav aria-label="On this page" className="mt-3 grid sm:grid-cols-2">
      {sections.map((section, index) => <a key={section.title} href={`#${prefix}-${index}`} className="flex min-h-11 items-center py-2 text-sm text-primary underline-offset-4 hover:underline">{section.title}</a>)}
    </nav>
  </details>;
}
