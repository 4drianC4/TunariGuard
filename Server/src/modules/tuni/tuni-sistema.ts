const plataforma = '(?:tunari ?guard|(?:el |la |esta |este |the |this )?(?:plataforma(?: web)?|sistema|web|aplicacion(?: web)?|app|platform|system|website|dashboard))';
const saludo = /^(?:(?:hola|hello|hi|hey|buenos dias|buenas tardes|buenas noches|good (?:morning|afternoon|evening))(?: tuni)? |tuni )+/;
const cortesia = /^(?:(?:y|and|please|por favor|dime|cuentame(?: sobre)?|hablame de|explicame|(?:me )?puedes (?:decir(?:me)?|explicar(?:me)?)|(?:(?:can|could) you )?tell me(?: about)?|(?:can you )?explain) )+/;

const preguntas = {
  'sistema-panorama': new RegExp(`^(?:(?:que es|para que sirve|como funciona|que funciones tiene|descripcion(?: completa)? de|what (?:is|s|does)|how does|what can i do (?:with|in)|overview of) )?${plataforma}(?: (?:y para que sirve|do|work|used for|and what (?:is it (?:for|used for)|does it do)))?$`),
  'sistema-datos': new RegExp(`^(?:` +
    `(?:que|cuales) (?:datos|fuentes|sensores|satelites) (?:usa(?:n)?|utiliza(?:n)?|emplea(?:n)?)(?: ${plataforma})?|` +
    `de donde (?:vienen|salen|provienen|(?:saca|sacan|obtiene|obtienen)) (?:los |sus )?datos(?: (?:de |en )${plataforma})?|` +
    `(?:fuentes(?: de datos)?|origen de (?:los )?datos|data sources)(?: (?:de |of |for )${plataforma})?|` +
    `(?:como se (?:obtienen|actualizan) (?:los |sus )?datos|how (?:are (?:the )?data updated|does ${plataforma} update (?:its|the) data))|` +
    `what (?:data|sources|sensors|satellites) (?:does ${plataforma}|do you|do they) use|` +
    `where (?:do (?:the )?data come from|does ${plataforma} get (?:its|the) data))$`),
  'sistema-uso': new RegExp(`^(?:como (?:uso|usar|se usa)|how (?:do i use|to use)) (?:${plataforma}|(?:el |la |los |the )?(?:mapa|map|historial|history|armonizacion|harmonization|distritos|districts)(?: (?:de |in )${plataforma})?)$`),
  'sistema-metodo': new RegExp(`^(?:(?:que (?:metodologia|metodo) (?:usa|aplica)|what (?:method|methodology) does) ${plataforma}(?: use)?|(?:(?:cuales son )?(?:las )?limitaciones|metodologia|methodology|limitations) (?:de |of )${plataforma})$`),
  'sistema-alertas': /^(?:como funciona(?:n)? (?:la |las )?alertas?(?: operativas?)?|what (?:is an operational alert|are operational alerts)|how do (?:the )?(?:operational )?alerts work|(?:que )?diferencia entre alertas (?:operativas y estadisticas|estadisticas y operativas)|difference between (?:operational and statistical|statistical and operational) alerts)$/,
  'sistema-reportes': /^(?:como (?:(?:puedo )?(?:exportar|descargar)|exporto|descargo) (?:los |un )?(?:reportes?|informes?|datos|detecciones|csv|geojson)|how (?:do i|can i|to) (?:export|download) (?:a |the )?(?:reports?|data|detections|csv|geojson))$/,
  'sistema-proyecciones': /^(?:que (?:es la simulacion|son las proyecciones)|como funcionan (?:las )?proyecciones|what (?:is the simulation|are projections)|how do (?:the )?projections work)$/,
  'sistema-arquitectura': new RegExp(`^(?:` +
    `(?:arquitectura|tecnologias|stack|frontend|backend|api|base de datos|architecture|tech stack|database) (?:de |of |for )?${plataforma}|` +
    `(?:que (?:tecnologias|stack|base de datos) (?:usa|utiliza)|what (?:technologies|tech stack|database) does)(?: ${plataforma})?(?: use)?|` +
    `(?:como funciona|how does) (?:la |the )?(?:api|base de datos|database)(?: (?:de |of )${plataforma})?(?: work)?)$`),
  'sistema-tuni': /^(?:que (?:es tuni|puedes hacer|hace tuni|puede hacer tuni)|quien eres|quien es tuni|como funciona tuni|what (?:is tuni|can you do|can tuni do|does tuni do)|who (?:are you|is tuni)|how does tuni work)$/,
} satisfies Record<string, RegExp>;

export type TemaSistema = keyof typeof preguntas;
export const temasSistema = Object.keys(preguntas) as TemaSistema[];

export function temaDelSistema(textoNormalizado: string): TemaSistema | undefined {
  const pregunta = textoNormalizado.replace(saludo, '').replace(cortesia, '').replace(/ por favor$| please$/, '');
  return temasSistema.find((tema) => preguntas[tema].test(pregunta));
}
