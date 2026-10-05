/** The landing owns the whole viewport (its own split layout, nav and footer). */
export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return <main className="flex flex-1 flex-col">{children}</main>;
}
