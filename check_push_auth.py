import asyncio
import json
import os
from pathlib import Path
from playwright.async_api import async_playwright

SCREENSHOTS = Path("/tmp/browser/push_audit/screenshots")
SCREENSHOTS.mkdir(parents=True, exist_ok=True)

async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        # Permissões de notificação
        context = await browser.new_context(
            viewport={"width": 379, "height": 800},
            permissions=["notifications"]
        )
        page = await context.new_page()

        print("[TEST] Iniciando Auditoria de Autenticação para Push...")
        
        # 1. Login
        await page.goto("http://localhost:8080")
        await page.wait_for_selector("text=ENTRAR")
        
        # Screenshot inicial
        await page.screenshot(path=str(SCREENSHOTS / "1_login_page.png"))
        
        # Simular login (assumindo que já existe um jogador de teste ou usando credenciais se disponíveis)
        # Como não temos credenciais aqui, vamos apenas verificar o estado da sessão Supabase após o carregamento da Home
        # se o usuário já estiver logado via cookies injetados (se o ambiente permitir).
        
        # 2. Verificar Sessão Supabase vs Player Session via Evaluate
        auth_state = await page.evaluate("""
            async () => {
                const { supabase } = await import('/src/integrations/supabase/client.ts');
                const { data: { session } } = await supabase.auth.getSession();
                const { data: userData } = await supabase.auth.getUser();
                
                return {
                    supabaseSessionExists: !!session,
                    supabaseUserExists: !!userData.user,
                    supabaseUserId: session?.user?.id,
                    localStorageKeys: Object.keys(window.localStorage).filter(k => k.includes('auth-token'))
                };
            }
        """)
        
        print(f"[TEST] Supabase Auth State: {json.dumps(auth_state, indent=2)}")
        
        # 3. Tentar clicar em ATIVAR NOTIFICAÇÕES (se o banner estiver visível)
        # Vamos procurar pelo botão no PlayerRoundStatusCard ou similar
        try:
            activate_btn = page.get_by_role("button", name="ATIVAR NOTIFICAÇÕES")
            if await activate_btn.is_visible():
                print("[TEST] Clicando em ATIVAR NOTIFICAÇÕES...")
                await activate_btn.click()
                
                # Esperar pelo toast de sucesso ou erro
                await page.wait_for_timeout(2000)
                await page.screenshot(path=str(SCREENSHOTS / "2_after_click.png"))
                
                # Capturar logs do console para ver o trace
                logs = await page.evaluate("window._logs || []")
                print(f"[TEST] Console Logs capturados: {len(logs)}")
        except Exception as e:
            print(f"[TEST] Botão não encontrado ou erro ao clicar: {e}")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
