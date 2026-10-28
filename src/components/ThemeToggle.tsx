import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTheme } from "@/components/ThemeProvider"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  const isDark = theme === "dark" || (theme === "system" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches)

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className="h-9 w-9 rounded-lg hover:bg-muted text-foreground transition-colors shrink-0"
            aria-label={isDark ? "Ativar tema claro" : "Ativar tema escuro"}
          >
            {isDark ? (
              <Sun className="h-5 w-5 text-[var(--accent-neon)]" />
            ) : (
              <Moon className="h-5 w-5 text-[var(--accent-neon)]" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{isDark ? "Ativar tema claro" : "Ativar tema escuro"}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
