import { describe, expect, it } from 'vitest';
import { parseManualCsv } from './parse-manual-csv';

const HEADER = 'name,address,latitude,longitude,province,provider,connectorTypes,maxPowerKw,stationType,sourceUrl';

describe('parseManualCsv', () => {
  it('parses a single valid row', () => {
    const csv = `${HEADER}
Porsche Hà Nội,"Pham Van Dong, Hanoi",21.0511,105.7795,Hà Nội,Porsche,CCS2,150,DC,https://example.com/x`;
    const rows = parseManualCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      name: 'Porsche Hà Nội',
      address: 'Pham Van Dong, Hanoi',
      latitude: 21.0511,
      longitude: 105.7795,
      province: 'Hà Nội',
      provider: 'Porsche',
      connectorTypes: ['CCS2'],
      maxPowerKw: 150,
      stationType: 'DC',
      sourceUrl: 'https://example.com/x',
    });
  });

  it('skips comment lines starting with #', () => {
    const csv = `${HEADER}
# this is a comment
Porsche,addr,21,105.5,Hà Nội,Porsche,CCS2,150,DC,https://example.com`;
    expect(parseManualCsv(csv)).toHaveLength(1);
  });

  it('skips blank lines', () => {
    const csv = `${HEADER}

Porsche,addr,21,105.5,Hà Nội,Porsche,CCS2,150,DC,https://example.com

`;
    expect(parseManualCsv(csv)).toHaveLength(1);
  });

  it('parses multiple connectors split on commas inside the cell', () => {
    const csv = `${HEADER}
Hub,addr,21,105.5,Hà Nội,X,"CCS2,Type2_AC",60,DC,https://example.com`;
    const rows = parseManualCsv(csv);
    expect(rows[0].connectorTypes).toEqual(['CCS2', 'Type2_AC']);
  });

  it('throws when a row has the wrong column count', () => {
    const csv = `${HEADER}
Just,Two,Cols`;
    expect(() => parseManualCsv(csv)).toThrow(/expected/i);
  });

  it('throws when latitude is not a number', () => {
    const csv = `${HEADER}
Bad,addr,not-a-number,105,Hà Nội,X,CCS2,60,DC,https://example.com`;
    expect(() => parseManualCsv(csv)).toThrow(/latitude/i);
  });

  it('throws when sourceUrl is missing', () => {
    const csv = `${HEADER}
Bad,addr,21,105,Hà Nội,X,CCS2,60,DC,`;
    expect(() => parseManualCsv(csv)).toThrow(/sourceUrl/i);
  });

  it('throws when latitude is outside Vietnam bounds', () => {
    const csv = `${HEADER}
Bad,addr,40.7,105,Hà Nội,X,CCS2,60,DC,https://example.com`;
    expect(() => parseManualCsv(csv)).toThrow(/Vietnam/i);
  });
});
