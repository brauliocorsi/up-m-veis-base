/** Validação oficial do NIF português (mesma regra usada na base de dados). */
export function nifValido(nif: string | null | undefined): boolean {
  if (!nif) return false;
  const valor = nif.replace(/\s/g, "");
  if (!/^[0-9]{9}$/.test(valor)) return false;
  if (valor === "999999990") return true;

  const prefixosUm = ["1", "2", "3", "5", "6", "8", "9"];
  const prefixosDois = [
    "45", "70", "71", "72", "74", "75", "77", "78", "79", "90", "91", "98", "99",
  ];
  if (!prefixosUm.includes(valor[0]!) && !prefixosDois.includes(valor.slice(0, 2))) {
    return false;
  }

  let soma = 0;
  for (let i = 0; i < 8; i += 1) {
    soma += Number(valor[i]) * (9 - i);
  }
  const resto = soma % 11;
  const controlo = resto < 2 ? 0 : 11 - resto;
  return controlo === Number(valor[8]);
}

/** Passa qualquer telefone para o formato internacional (+351…). */
export function normalizarTelefone(valor: string | null | undefined, pais = "PT"): string | null {
  if (!valor) return null;
  let d = valor.replace(/[^0-9+]/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = `+${d.slice(2)}`;
  if (d.startsWith("+")) return d;
  if (pais === "PT" && d.length === 9) return `+351${d}`;
  if (pais === "PT" && d.length === 12 && d.startsWith("351")) return `+${d}`;
  return `+${d}`;
}
