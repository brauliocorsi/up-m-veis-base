import { useState } from "react";

export function useListagem(ordemInicial = "criado_em", ascendenteInicial = false, tamanho = 20) {
  const [pesquisa, setPesquisa] = useState("");
  const [pagina, setPagina] = useState(1);
  const [ordenarPor, setOrdenarPor] = useState(ordemInicial);
  const [ascendente, setAscendente] = useState(ascendenteInicial);

  return {
    pesquisa,
    pagina,
    ordenarPor,
    ascendente,
    tamanho,
    onPesquisa: (valor: string) => {
      setPesquisa(valor);
      setPagina(1);
    },
    onPagina: setPagina,
    onOrdenar: (campo: string) => {
      if (campo === ordenarPor) {
        setAscendente((v) => !v);
      } else {
        setOrdenarPor(campo);
        setAscendente(true);
      }
      setPagina(1);
    },
  };
}
