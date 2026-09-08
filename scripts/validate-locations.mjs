import fs from "node:fs";

const file = new URL("../locations.json", import.meta.url);
const cards = JSON.parse(fs.readFileSync(file, "utf8"));
const required = ["id", "nome", "pista", "periodo", "resposta", "pais", "regiao", "categoria", "lat", "lng", "revelacao", "imagemArquivo", "imagemAlt"];
const expectedCategories = new Map([
  ["Arte rupestre", 64],
  ["Recorde geográfico", 84],
  ["Lugar marcante", 84],
  ["História", 24],
  ["Cultura e invenções", 44]
]);
const errors = [];
const ids = new Set();
const files = new Set();
const counts = new Map();
const normalize = (value) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

if (cards.length !== 300) errors.push(`Esperadas 300 cartas; encontradas ${cards.length}.`);

for (const [index, card] of cards.entries()) {
  const where = `Carta ${index + 1} (${card.id || "sem id"})`;
  for (const field of required) {
    if (card[field] === undefined || card[field] === null || card[field] === "") errors.push(`${where}: campo ${field} ausente.`);
  }
  if (ids.has(card.id)) errors.push(`${where}: id duplicado.`);
  ids.add(card.id);
  if (files.has(card.imagemArquivo)) errors.push(`${where}: imagem duplicada (${card.imagemArquivo}).`);
  files.add(card.imagemArquivo);
  if (!Number.isFinite(card.lat) || card.lat < -90 || card.lat > 90) errors.push(`${where}: latitude inválida.`);
  if (!Number.isFinite(card.lng) || card.lng < -180 || card.lng > 180) errors.push(`${where}: longitude inválida.`);
  if (card.raioKm !== undefined && (!Number.isFinite(card.raioKm) || card.raioKm <= 0)) errors.push(`${where}: raioKm inválido.`);
  counts.set(card.categoria, (counts.get(card.categoria) || 0) + 1);
  const answer = normalize(card.resposta);
  // O título identifica objetivamente o tema da carta; pista, período e imagem
  // continuam sem antecipar a resposta completa.
  for (const field of ["pista", "periodo", "imagemAlt"]) {
    if (answer.length > 4 && normalize(card[field]).includes(answer)) errors.push(`${where}: ${field} entrega a resposta completa.`);
  }
  if (/(^|[_ -])(map|mapa|location|route)([_ .-]|$)/i.test(card.imagemArquivo)) errors.push(`${where}: imagem parece ser um mapa ou diagrama revelador.`);
  if ((card.categoria === "Arte rupestre" || card.categoria === "Lugar marcante") && card.nome !== card.resposta) {
    errors.push(`${where}: o título deve usar o nome objetivo do local.`);
  }
}

for (const [category, expected] of expectedCategories) {
  if (counts.get(category) !== expected) errors.push(`Categoria ${category}: esperadas ${expected}, encontradas ${counts.get(category) || 0}.`);
}
for (const category of counts.keys()) {
  if (!expectedCategories.has(category)) errors.push(`Categoria inesperada: ${category}.`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`OK: ${cards.length} cartas, ${ids.size} ids e ${files.size} imagens únicas.`);
console.log([...counts].map(([category, total]) => `${category}: ${total}`).join(" | "));
