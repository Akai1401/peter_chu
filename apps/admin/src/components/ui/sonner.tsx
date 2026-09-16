import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      richColors
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:shadow-xl font-sans text-sm rounded-xl border p-4 flex items-center gap-3 transition-all",
          success:
            "!bg-emerald-50 !text-emerald-950 !border-emerald-300 dark:!bg-emerald-950/90 dark:!text-emerald-100 dark:!border-emerald-700 [&>[data-icon]]:!text-emerald-600 dark:[&>[data-icon]]:!text-emerald-400 font-medium",
          error:
            "!bg-rose-50 !text-rose-950 !border-rose-300 dark:!bg-rose-950/90 dark:!text-rose-100 dark:!border-rose-700 [&>[data-icon]]:!text-rose-600 dark:[&>[data-icon]]:!text-rose-400 font-medium",
          warning:
            "!bg-amber-50 !text-amber-950 !border-amber-300 dark:!bg-amber-950/90 dark:!text-amber-100 dark:!border-amber-700 [&>[data-icon]]:!text-amber-600 dark:[&>[data-icon]]:!text-amber-400 font-medium",
          info:
            "!bg-sky-50 !text-sky-950 !border-sky-300 dark:!bg-sky-950/90 dark:!text-sky-100 dark:!border-sky-700 [&>[data-icon]]:!text-sky-600 dark:[&>[data-icon]]:!text-sky-400 font-medium",
          description: "group-[.toast]:text-muted-foreground text-xs",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground font-semibold px-3 py-1.5 rounded-lg text-xs",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground font-semibold px-3 py-1.5 rounded-lg text-xs",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
