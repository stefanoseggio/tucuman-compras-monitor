import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseListingPage } from '../../src/parsers/listing.js';

const fixturesDir = fileURLToPath(new URL('../fixtures', import.meta.url));

function loadFixtureHtml(name: string): string {
    // Real captured bytes (curl -L -o file), ISO-8859-1 as served by the portal -
    // decoded exactly the way src/http.ts decodes a live response, so the parser
    // test exercises the same encoding path production traffic goes through.
    const buffer = readFileSync(`${fixturesDir}/${name}`);
    return new TextDecoder('iso-8859-1').decode(buffer);
}

const PAGE_URL =
    'https://comprasbys.tucuman.gob.ar/ver_llamados_compras_avanzado.php?n=1&pagina_actual=4&estado_compra=1';

describe('parseListingPage - estado 1 (apertura proxima), pagina 4 of 7', () => {
    const html = loadFixtureHtml('listing_estado1_pagina4.html');
    const parsed = parseListingPage(html, PAGE_URL);

    it('reads num_total from the hidden form field', () => {
        expect(parsed.numTotal).toBe(31);
    });

    it('extracts exactly 5 tenders, matching the 5 modal ids on the page', () => {
        expect(parsed.items).toHaveLength(5);
        expect(parsed.items.map((t) => t.idCompra)).toEqual(['8898', '8906', '8888', '8887', '8867']);
    });

    it('correctly pairs each tender modal with ITS OWN card fields, not an off-by-one neighbor', () => {
        // Regression guard: an earlier prototype paired modal[i] with the WRONG
        // card because of nested div.table matches. Cross-checked live against
        // each modal's own internal "Numero de expediente" text (see AGENTS.md).
        const first = parsed.items[0];
        expect(first.idCompra).toBe('8898');
        expect(first.reparticion).toBe('MINISTERIO DE SEGURIDAD - DEPARTAMENTO GENERAL DE POLICIA');
        expect(first.numeroExpediente).toBe('499/219-T-2026');

        const second = parsed.items[1];
        expect(second.idCompra).toBe('8906');
        expect(second.reparticion).toBe('DIRECCION ARQUITECTURA Y URBANISMO');
        expect(second.numeroExpediente).toBe('1046/321-A-2026');
    });

    it('decodes Spanish accented characters correctly (round-trips through ISO-8859-1)', () => {
        const tender = parsed.items.find((t) => t.idCompra === '8887')!;
        expect(tender.primerRenglon).toContain('contratación');
        const withAccent = parsed.items.find((t) => t.idCompra === '8867')!;
        expect(withAccent.renglones[0].descripcion).toContain('Adquisición');
        expect(withAccent.renglones[0].descripcion).toContain('Dirección de Políticas Alimentarias');
        const withAccentedLugar = parsed.items.find((t) => t.idCompra === '8906')!;
        expect(withAccentedLugar.lugarApertura).toBe('Dirección de Arquitectura y Urbanismo');
    });

    it('extracts core card fields', () => {
        const tender = parsed.items[0];
        expect(tender.tipoCompra).toBe('CONCURSO DE PRECIOS');
        expect(tender.valorPliego).toBe('Gratuito');
        expect(tender.rubro).toBe('REPUESTOS Y ACCESORIOS');
        expect(tender.primerRenglon).toBe('Repuestos Toyota Hilux');
        expect(tender.fechaAperturaSobres).toBe('10/09/2026, 12:30:00');
        expect(tender.fechaAdjudicacion).toBeNull(); // not yet awarded
    });

    it('leaves objetoLibre null when the site published no free-text note (the common case)', () => {
        const withoutNote = parsed.items.find((t) => t.idCompra === '8906')!;
        expect(withoutNote.objetoLibre).toBeNull();
        const withNote = parsed.items.find((t) => t.idCompra === '8898')!;
        expect(withNote.objetoLibre).toBe('compra de repuestos para movil TUC 2165');
    });

    it('resolves the pliego PDF to an absolute, fetchable URL only when the site actually links one', () => {
        const withPdf = parsed.items.find((t) => t.idCompra === '8898')!;
        expect(withPdf.pliegoPdfUrl).toBe('https://comprasbys.tucuman.gob.ar/aplicacion/a_pdf/Licitacion8898.pdf');

        const withoutPdf = parsed.items.find((t) => t.idCompra === '8906')!;
        expect(withoutPdf.pliegoPdfUrl).toBeNull();
    });

    it('extracts modal-only fields not present anywhere on the outer card', () => {
        const tender = parsed.items.find((t) => t.idCompra === '8906')!;
        expect(tender.numeroConvocatoria).toBe('CONCURSO DE PRECIOS Nº 012/2026');
        expect(tender.autorizadoPor).toBe('Resol. 1279/D 26/08/2026');
        expect(tender.presupuestoOficial).toBe('$ 1.320.000,00');
        expect(tender.garantiaOfertaExigida).toBe('$ 0,00');
    });

    it('extracts the single renglon as a one-element breakdown array', () => {
        const tender = parsed.items[0];
        expect(tender.renglones).toHaveLength(1);
        expect(tender.renglones[0].renglon).toBe('1');
        expect(tender.renglones[0].descripcion).toContain('Repuestos Toyota Hilux');
    });
});

describe('parseListingPage - estado 1, last page (partial page: 1 item, not 5)', () => {
    it('extracts exactly the true remainder, not a full page of 5', () => {
        const html = loadFixtureHtml('listing_estado1_pagina7.html');
        const parsed = parseListingPage(
            html,
            'https://comprasbys.tucuman.gob.ar/ver_llamados_compras_avanzado.php?n=1&pagina_actual=7&estado_compra=1',
        );
        expect(parsed.numTotal).toBe(31);
        expect(parsed.items).toHaveLength(1);
    });
});

describe('parseListingPage - out-of-range page (beyond the last real page)', () => {
    it('returns zero items without throwing, rather than crashing on an empty page', () => {
        const html = loadFixtureHtml('listing_estado1_pagina99.html');
        const parsed = parseListingPage(
            html,
            'https://comprasbys.tucuman.gob.ar/ver_llamados_compras_avanzado.php?n=1&pagina_actual=99&estado_compra=1',
        );
        expect(parsed.numTotal).toBe(31); // num_total stays correct even past the end
        expect(parsed.items).toHaveLength(0);
    });
});

describe('parseListingPage - estado 3 (adjudicadas)', () => {
    const html = loadFixtureHtml('listing_estado3_pagina1.html');
    const parsed = parseListingPage(
        html,
        'https://comprasbys.tucuman.gob.ar/ver_llamados_compras_avanzado.php?n=1&pagina_actual=1&estado_compra=3',
    );

    it('reads a much larger num_total than estado 1', () => {
        expect(parsed.numTotal).toBe(313);
    });

    it('extracts fechaAdjudicacion, populated only for awarded tenders', () => {
        const tender = parsed.items[0];
        expect(tender.fechaAdjudicacion).toBe('08/11/2023');
    });

    it('extracts fechaAperturaSobres even though estado 3 uses a DIFFERENT label ("Se abrio sobres el dia" vs "Apertura de sobres:")', () => {
        // Regression guard for the label-text trap the audit notes did not anticipate.
        const tender = parsed.items[0];
        expect(tender.fechaAperturaSobres).toBe('24/10/2023, 10:00:00');
    });
});

describe('parseListingPage - multi-renglon tenders (estado 3, pagina 10)', () => {
    it('extracts the FULL renglon breakdown from the modal table, not just the card preview of renglon 1', () => {
        const html = loadFixtureHtml('listing_estado3_pagina10.html');
        const parsed = parseListingPage(
            html,
            'https://comprasbys.tucuman.gob.ar/ver_llamados_compras_avanzado.php?n=1&pagina_actual=10&estado_compra=3',
        );

        const withThree = parsed.items.find((t) => t.idCompra === '1547')!;
        expect(withThree.renglones).toHaveLength(3);

        const withFour = parsed.items.find((t) => t.idCompra === '1539')!;
        expect(withFour.renglones).toHaveLength(4);
        // The card's own "primerRenglon" still only ever shows renglon 1, by the site's own design.
        expect(withFour.primerRenglon.length).toBeGreaterThan(0);
    });
});
