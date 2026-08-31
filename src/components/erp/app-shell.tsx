import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  BadgeEuro,
  BarChart3,
  CalendarClock,
  CalendarDays,
  CalendarRange,

  ChevronDown,
  ChevronRight,
  HandCoins,
  Scale,

  
  ClipboardCheck,
  ClipboardList,
  Boxes,
  Contact,
  Factory,
  FileQuestion,
  FolderTree,
  History,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  LogOut,
  MapPinned,
  Menu,
  Route,

  Package,
  PackageCheck,
  PackageSearch,
  Percent,
  Receipt,
  RefreshCw,
  ScanSearch,
  Settings,
  ShoppingCart,
  Ticket,
  Trash2,
  Truck,
  Users,
  Wallet,
  Warehouse,
  Wrench,
} from "lucide-react";

import type { LucideIcon } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import { IndicadorSync } from "@/components/erp/indicador-sync";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useSessao } from "@/hooks/use-sessao";
import { supabase } from "@/integrations/supabase/client";
import { ETIQUETA_PERFIL, type Perfil } from "@/lib/erp/tipos";
import { cn } from "@/lib/utils";

interface ItemNav {
  para: string;
  etiqueta: string;
  icone: LucideIcon;
  perfis?: Perfil[];
}

interface GrupoNav {
  etiqueta: string;
  itens: ItemNav[];
}

const NAVEGACAO: GrupoNav[] = [
  {
    etiqueta: "Geral",
    itens: [{ para: "/painel", etiqueta: "Painel", icone: LayoutDashboard }],
  },
  {
    etiqueta: "Rota",
    itens: [
      {
        para: "/rota",
        etiqueta: "A minha rota",
        icone: Route,
        perfis: ["entregador", "adm"],
      },
      {
        para: "/rotas",
        etiqueta: "Rotas",
        icone: MapPinned,
        perfis: ["adm", "escritorio", "financeiro"],
      },
      {
        para: "/por-agendar",
        etiqueta: "Por agendar",
        icone: CalendarClock,
        perfis: ["adm", "escritorio"],
      },
      {
        para: "/rota-modelos",
        etiqueta: "Modelos de rota",
        icone: CalendarRange,
        perfis: ["adm", "escritorio"],
      },
      {
        para: "/viaturas",
        etiqueta: "Viaturas",
        icone: Truck,
        perfis: ["adm", "escritorio"],
      },
      {
        para: "/assistencias",
        etiqueta: "Assistências",
        icone: LifeBuoy,
        perfis: ["adm", "escritorio", "financeiro"],
      },
    ],
  },

  {
    etiqueta: "Vendas",
    itens: [
      { para: "/pedidos", etiqueta: "Vendas", icone: ShoppingCart },
      { para: "/entregas", etiqueta: "Entregas", icone: Truck },
      {
        para: "/entregue-por-receber",
        etiqueta: "Entregue por receber",
        icone: HandCoins,
        perfis: ["adm", "financeiro", "escritorio"],
      },
      { para: "/clientes", etiqueta: "Clientes", icone: Contact, perfis: ["adm", "vendedora", "escritorio"] },
      { para: "/cupoes", etiqueta: "Cupões", icone: Ticket, perfis: ["adm"] },
    ],
  },

  {
    etiqueta: "Caixa e pagamentos",
    itens: [
      {
        para: "/caixa",
        etiqueta: "Caixa da loja",
        icone: Wallet,
        perfis: ["adm", "financeiro", "escritorio", "vendedora", "compras"],
      },
      {
        para: "/meu-caixa",
        etiqueta: "O meu caixa",
        icone: Wallet,
        perfis: ["entregador", "adm"],
      },
      {
        para: "/pagamentos",
        etiqueta: "Pagamentos",
        icone: BadgeEuro,
        perfis: ["adm", "financeiro", "escritorio"],
      },
      { para: "/caixas", etiqueta: "Caixas da equipa", icone: Wallet, perfis: ["adm"] },
    ],
  },
  {
    etiqueta: "Financeiro",
    itens: [
      {
        para: "/contas-receber",
        etiqueta: "Contas a receber",
        icone: HandCoins,
        perfis: ["adm", "financeiro", "escritorio"],
      },
      {
        para: "/despesas",
        etiqueta: "Despesas",
        icone: Receipt,
        perfis: ["adm", "financeiro"],
      },
      {
        para: "/conciliacao",
        etiqueta: "Conciliação",
        icone: Scale,
        perfis: ["adm", "financeiro"],
      },
      {
        para: "/relatorios",
        etiqueta: "Relatórios",
        icone: BarChart3,
        perfis: ["adm", "financeiro", "escritorio", "compras"],
      },
    ],
  },
  {

    etiqueta: "Inventário",
    itens: [
      { para: "/produtos", etiqueta: "Produtos", icone: Package },
      { para: "/stock", etiqueta: "Stock", icone: Warehouse },
      { para: "/reservas", etiqueta: "Reservas", icone: Boxes },
      { para: "/movimentos", etiqueta: "Movimentos", icone: ClipboardList },
      { para: "/categorias", etiqueta: "Categorias", icone: FolderTree },
      { para: "/servicos", etiqueta: "Serviços", icone: Wrench },
    ],
  },
  {
    etiqueta: "Compras",
    itens: [
      {
        para: "/necessidades",
        etiqueta: "Necessidades",
        icone: ClipboardCheck,
        perfis: ["adm", "compras", "escritorio", "financeiro"],
      },
      {
        para: "/ordens-compra",
        etiqueta: "Ordens de compra",
        icone: PackageSearch,
        perfis: ["adm", "compras", "escritorio", "financeiro"],
      },
      {
        para: "/recepcao",
        etiqueta: "Receção",
        icone: PackageCheck,
        perfis: ["adm", "compras"],
      },
      { para: "/pedidos-compra", etiqueta: "Pedidos de compra", icone: FileQuestion },
      {
        para: "/contas-pagar",
        etiqueta: "Contas a pagar",
        icone: Receipt,
        perfis: ["adm", "financeiro", "compras"],
      },
      { para: "/fornecedores", etiqueta: "Fornecedores", icone: Factory },
    ],
  },
  {
    etiqueta: "Administração",
    itens: [
      { para: "/utilizadores", etiqueta: "Utilizadores", icone: Users, perfis: ["adm"] },
      { para: "/regras-desconto", etiqueta: "Regras de desconto", icone: Percent, perfis: ["adm"] },
      { para: "/formas-pagamento", etiqueta: "Formas de pagamento", icone: BadgeEuro, perfis: ["adm"] },
      { para: "/zonas-entrega", etiqueta: "Zonas de entrega", icone: Truck, perfis: ["adm"] },
      { para: "/calendario", etiqueta: "Calendário", icone: CalendarDays, perfis: ["adm"] },
      { para: "/motivos", etiqueta: "Motivos", icone: ListChecks, perfis: ["adm"] },
      { para: "/sincronizacao", etiqueta: "Sincronização", icone: RefreshCw, perfis: ["adm"] },
      { para: "/reconciliacao", etiqueta: "Reconciliação", icone: ScanSearch, perfis: ["adm"] },
      { para: "/definicoes", etiqueta: "Definições", icone: Settings, perfis: ["adm"] },
      { para: "/lixeira", etiqueta: "Lixeira", icone: Trash2, perfis: ["adm"] },
      { para: "/historico", etiqueta: "Histórico", icone: History, perfis: ["adm"] },
    ],
  },
];


function Marca() {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
        UP
      </span>
      <span className="text-sm font-semibold tracking-tight">UP Vendas</span>
    </div>
  );
}

const CHAVE_CATEGORIA = "up-vendas:categoria-aberta";

function rotaAtiva(caminho: string, para: string) {
  return caminho === para || caminho.startsWith(`${para}/`);
}

export function AppShell({ children }: { children: ReactNode }) {
  const { data: sessao, isLoading } = useSessao();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const caminho = useRouterState({ select: (s) => s.location.pathname });
  const [menuAberto, setMenuAberto] = useState(false);
  const [categoriaAberta, setCategoriaAberta] = useState<string | null>(null);
  const refLateral = useRef<HTMLElement | null>(null);
  const restaurado = useRef(false);

  // Restaurar a categoria guardada (persistente entre navegações e recargas).
  useEffect(() => {
    if (restaurado.current) return;
    restaurado.current = true;
    const guardada = window.localStorage.getItem(CHAVE_CATEGORIA);
    if (guardada) setCategoriaAberta(guardada);
  }, []);

  useEffect(() => {
    if (!restaurado.current) return;
    if (categoriaAberta) window.localStorage.setItem(CHAVE_CATEGORIA, categoriaAberta);
    else window.localStorage.removeItem(CHAVE_CATEGORIA);
  }, [categoriaAberta]);

  useEffect(() => {
    const utilizador = sessao?.utilizador;
    if (!utilizador || !utilizador.ativo) return;
    const ativa = NAVEGACAO.find((grupo) =>
      grupo.itens.some((item) => {
        if (item.perfis && !item.perfis.includes(utilizador.perfil)) return false;
        return rotaAtiva(caminho, item.para);
      }),
    );
    if (ativa) setCategoriaAberta(ativa.etiqueta);
  }, [caminho, sessao?.utilizador?.perfil]);

  // Fechar o dropdown ao clicar fora do menu lateral.
  useEffect(() => {
    function aoClicarFora(evento: MouseEvent) {
      const alvo = evento.target as HTMLElement | null;
      if (!alvo || !refLateral.current) return;
      if (refLateral.current.contains(alvo)) return;
      if (alvo.closest?.("[data-menu]")) return;
      setCategoriaAberta(null);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  async function sair() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const utilizador = sessao?.utilizador ?? null;
  // O entregador só vê o que estiver explicitamente aberto ao seu perfil.
  const grupos = utilizador
    ? NAVEGACAO.map((grupo) => ({
        ...grupo,
        itens: grupo.itens.filter((item) =>
          utilizador.perfil === "entregador"
            ? Boolean(item.perfis?.includes("entregador"))
            : !item.perfis || item.perfis.includes(utilizador.perfil),
        ),
      })).filter((grupo) => grupo.itens.length > 0)
    : [];


  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        A carregar…
      </div>
    );
  }

  if (!utilizador || !utilizador.ativo) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6 text-center">
          <Marca />
          <h1 className="text-lg font-semibold">Acesso suspenso</h1>
          <p className="text-sm text-muted-foreground">
            {utilizador
              ? "A sua conta está desativada. Fale com a Administração da UP Móveis para voltar a ter acesso."
              : "A sua conta ainda não está associada à UP Móveis. Pedimos que fale com a Administração."}
          </p>
          <Button variant="outline" onClick={sair} className="w-full">
            <LogOut className="mr-2 h-4 w-4" /> Sair
          </Button>
        </div>
      </div>
    );
  }

  const itens = grupos.flatMap((g) => g.itens);
  const itensMobile = itens.slice(0, 3);
  const restantes = itens.slice(3);
  const gruposRestantes = grupos
    .map((grupo) => ({ ...grupo, itens: grupo.itens.filter((i) => restantes.includes(i)) }))
    .filter((grupo) => grupo.itens.length > 0);

  const grupoAtual = grupos.find((g) => g.itens.some((i) => rotaAtiva(caminho, i.para))) ?? null;
  const itemAtual = grupoAtual?.itens.find((i) => rotaAtiva(caminho, i.para)) ?? null;
  const subNivel = Boolean(itemAtual && caminho !== itemAtual.para);

  // Navegação por teclado dentro do menu: setas, Home/End e Escape.
  function aoTeclaMenu(evento: ReactKeyboardEvent<HTMLElement>) {
    const contentor = evento.currentTarget;
    const focaveis = Array.from(
      contentor.querySelectorAll<HTMLElement>("[data-nav-foco]"),
    ).filter((el) => el.offsetParent !== null || el.tagName === "BUTTON");
    const atual = document.activeElement as HTMLElement | null;
    const indice = atual ? focaveis.indexOf(atual) : -1;

    if (evento.key === "Escape") {
      setCategoriaAberta(null);
      return;
    }
    if (evento.key === "ArrowDown" || evento.key === "ArrowUp") {
      evento.preventDefault();
      if (focaveis.length === 0) return;
      const passo = evento.key === "ArrowDown" ? 1 : -1;
      const proximo = focaveis[(indice + passo + focaveis.length) % focaveis.length];
      proximo?.focus();
      return;
    }
    if (evento.key === "Home" || evento.key === "End") {
      evento.preventDefault();
      const alvo = evento.key === "Home" ? focaveis[0] : focaveis[focaveis.length - 1];
      alvo?.focus();
    }
  }

  const linhaNav = (item: ItemNav, aoClicar?: () => void, focavel = true) => {
    const ativo = rotaAtiva(caminho, item.para);
    return (
      <Link
        key={item.para}
        to={item.para}
        onClick={aoClicar}
        {...(focavel ? { "data-nav-foco": true } : { tabIndex: -1 })}
        aria-current={ativo ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
          ativo
            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
            : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60",
        )}
      >
        <item.icone className="h-4 w-4" />
        {item.etiqueta}
      </Link>
    );
  };

  const grupoNav = (grupo: GrupoNav, aoClicar?: () => void, classeBotao?: string) => {
    const aberto = categoriaAberta === grupo.etiqueta;
    const temAtivo = grupo.itens.some((item) => rotaAtiva(caminho, item.para));
    const idPainel = `nav-grupo-${grupo.etiqueta.replace(/\s+/g, "-").toLowerCase()}`;
    return (
      <div key={grupo.etiqueta}>
        <button
          type="button"
          data-nav-foco
          aria-expanded={aberto}
          aria-controls={idPainel}
          onClick={() => setCategoriaAberta(aberto ? null : grupo.etiqueta)}
          onKeyDown={(evento) => {
            if (evento.key === "ArrowRight" && !aberto) {
              evento.preventDefault();
              setCategoriaAberta(grupo.etiqueta);
            }
            if (evento.key === "ArrowLeft" && aberto) {
              evento.preventDefault();
              setCategoriaAberta(null);
            }
          }}
          className={cn(
            "flex w-full items-center justify-between rounded-md px-3 py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
            temAtivo ? "text-foreground" : "text-muted-foreground",
            classeBotao ?? "hover:bg-sidebar-accent/40",
          )}
        >
          {grupo.etiqueta}
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition-transform duration-300 ease-out",
              aberto ? "rotate-0" : "-rotate-90",
            )}
          />
        </button>
        <div
          id={idPainel}
          role="group"
          aria-label={grupo.etiqueta}
          aria-hidden={!aberto}
          className={cn(
            "grid transition-all duration-300 ease-out",
            aberto ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="overflow-hidden">
            <div className="mt-1 space-y-1 px-1">
              {grupo.itens.map((item) => linhaNav(item, aoClicar, aberto))}
            </div>
          </div>
        </div>
      </div>
    );
  };


  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-screen bg-background md:flex">
        <aside
          ref={refLateral}
          className="hidden w-64 shrink-0 border-r bg-sidebar p-4 md:block"
        >
          <div className="mb-6">
            <Marca />
          </div>
          <nav aria-label="Menu principal" className="space-y-2" onKeyDown={aoTeclaMenu}>
            {grupos.map((grupo) => grupoNav(grupo))}
          </nav>
        </aside>


        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur">
            <div className="flex min-w-0 items-center gap-3">
              <div className="md:hidden">
                <Marca />
              </div>
              <nav aria-label="Caminho de navegação" className="min-w-0">
                <ol className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  <li className="flex items-center gap-1">
                    <Link
                      to="/painel"
                      className="rounded px-1 py-0.5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Início
                    </Link>
                  </li>
                  {grupoAtual && (
                    <li className="flex items-center gap-1">
                      <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <button
                        type="button"
                        onClick={() => setCategoriaAberta(grupoAtual.etiqueta)}
                        className="rounded px-1 py-0.5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {grupoAtual.etiqueta}
                      </button>
                    </li>
                  )}
                  {itemAtual && (
                    <li className="flex min-w-0 items-center gap-1">
                      <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <Link
                        to={itemAtual.para}
                        aria-current={subNivel ? undefined : "page"}
                        className={cn(
                          "truncate rounded px-1 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          subNivel ? "hover:text-foreground" : "font-medium text-foreground",
                        )}
                      >
                        {itemAtual.etiqueta}
                      </Link>
                    </li>
                  )}
                  {subNivel && (
                    <li className="flex items-center gap-1">
                      <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span aria-current="page" className="px-1 py-0.5 font-medium text-foreground">
                        Detalhe
                      </span>
                    </li>
                  )}
                </ol>
              </nav>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-3">
              <IndicadorSync podeGerir={utilizador.perfil === "adm"} />
              <div className="text-right leading-tight">
                <p className="text-sm font-medium">{utilizador.nome}</p>
                <p className="text-xs text-muted-foreground">
                  {ETIQUETA_PERFIL[utilizador.perfil]}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={sair}>
                <LogOut className="mr-2 h-4 w-4" /> Sair
              </Button>
            </div>
          </header>

          <main className="flex-1 px-4 pb-24 pt-4 md:px-6 md:pb-8">{children}</main>
        </div>

        <nav
          data-menu
          className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t bg-background/95 px-2 py-2 backdrop-blur md:hidden"
        >
          {itensMobile.map((item) => {
            const ativo = rotaAtiva(caminho, item.para);
            return (
              <Link
                key={item.para}
                to={item.para}
                aria-current={ativo ? "page" : undefined}
                className={cn(
                  "flex flex-1 flex-col items-center gap-1 rounded-md px-1 py-1 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  ativo ? "font-medium text-primary" : "text-muted-foreground",
                )}
              >
                <item.icone className="h-5 w-5" />
                <span className="truncate">{item.etiqueta}</span>
              </Link>
            );
          })}
          {restantes.length > 0 && (
            <Sheet open={menuAberto} onOpenChange={setMenuAberto}>
              <SheetTrigger asChild>
                <button className="flex flex-1 flex-col items-center gap-1 rounded-md px-1 py-1 text-[11px] text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Menu className="h-5 w-5" />
                  Mais
                </button>
              </SheetTrigger>
              <SheetContent side="bottom" data-menu className="space-y-2 pb-8">
                <SheetTitle>Menu</SheetTitle>
                <nav aria-label="Menu" className="space-y-2" onKeyDown={aoTeclaMenu}>
                  {gruposRestantes.map((grupo) =>
                    grupoNav(grupo, () => setMenuAberto(false), "hover:bg-muted"),
                  )}
                </nav>
              </SheetContent>
            </Sheet>
          )}
        </nav>

      </div>
    </TooltipProvider>
  );
}

export function CabecalhoPagina({
  titulo,
  descricao,
  acao,
}: {
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{titulo}</h1>
        {descricao && <p className="mt-1 text-sm text-muted-foreground">{descricao}</p>}
      </div>
      {acao}
    </div>
  );
}
