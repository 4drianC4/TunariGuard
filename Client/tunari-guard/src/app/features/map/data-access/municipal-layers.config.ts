export interface MunicipalLayerDefinition {
  id: 'districts' | 'periurban' | 'cota2750';
  serviceId: string;
  name: string;
  purpose: string;
}

/** The only GAMC resources authorized for this feature. */
export const MUNICIPAL_LAYERS: readonly MunicipalLayerDefinition[] = [
  {
    id: 'districts',
    serviceId: '7eb13092-bf0e-493b-aae6-03c43eedda2c',
    name: 'Límite Distritos',
    purpose: 'Referencia para leer el contexto de los distritos municipales.'
  },
  {
    id: 'periurban',
    serviceId: 'c52066a1-32fd-4925-81e0-c2dcb8f4238f',
    name: 'Periurbanos',
    purpose: 'Contexto de las áreas periurbanas.'
  },
  {
    id: 'cota2750',
    serviceId: '297cefa4-0832-42bb-a98e-2cbea989fd9d',
    name: 'Cota 2750',
    purpose: 'Referencia denominada «Cota 2750»; no equivale al límite oficial del Parque Nacional Tunari.'
  }
];

/** Same-origin proxy; it must forward the GAMC key from server configuration. */
export const MUNICIPAL_WMS_PROXY = '';

export const MUNICIPAL_API_KEY = '';
