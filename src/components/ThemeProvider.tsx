import React, { createContext, useContext, useEffect, useState } from "react"

type Theme = "dark" | "light" | "system"

const isTheme = (value: string | null): value is Theme =>
  value === "dark" || value === "light" || value === "system"

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const initialState: ThemeProviderState = {
  theme: "system",
  setTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "spp-ui-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return defaultTheme
    const storedTheme = localStorage.getItem(storageKey)
    return isTheme(storedTheme) ? storedTheme : defaultTheme
  })

  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove("light", "dark")

    if (theme === "system") {
      const media = window.matchMedia("(prefers-color-scheme: dark)")
      const applySystemTheme = () => {
        root.classList.remove("light", "dark")
        const isDark = media.matches
        root.classList.add(isDark ? "dark" : "light")
        root.style.colorScheme = isDark ? "dark" : "light"
      }
      applySystemTheme()
      media.addEventListener("change", applySystemTheme)
      return () => media.removeEventListener("change", applySystemTheme)
    }

    root.classList.add(theme)
    root.style.colorScheme = theme
  }, [theme])

  const value = {
    theme,
    setTheme: (theme: Theme) => {
      if (typeof window !== "undefined") {
        localStorage.setItem(storageKey, theme)
      }
      setTheme(theme)
    },
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)
  if (context === undefined) throw new Error("useTheme must be used within a ThemeProvider")
  return context
}
