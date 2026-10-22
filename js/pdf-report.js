(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'), require('./report-radar.js'));
  else root.WashPdf = factory(root.WashCore, root.WashRadar);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Core, Radar) {
  const value = x => x === null || x === undefined || x === '' ? 'Sin registrar' : String(x);
  const line = (label, x) => ({text: [{text: label + ': ', bold: true}, value(x)], margin: [0, 3, 0, 3]});
  const risk = ind => ind.severity == null || ind.likelihood == null || ind.severity === '' || ind.likelihood === '' ? null : Number(ind.severity) + Number(ind.likelihood);
  const riskText = ind => { const n = risk(ind); return n === null ? 'Sin evaluar' : `${n} - ${n >= 15 ? 'Alto' : n >= 8 ? 'Medio' : 'Bajo'}`; };
  const table = (headers, rows, widths) => ({table: {headerRows: 1, widths: widths || headers.map(() => '*'), body: [headers.map(text => ({text, bold: true, fillColor: '#EAF1F8'})), ...(rows.length ? rows : [headers.map((_, i) => i ? '' : 'Sin registros')])]}, layout: 'lightHorizontalLines', margin: [0, 6, 0, 10], fontSize: 8});
  function definition(dataset, visibleCodes, modules) {
    const g = dataset.generalInfo;
    const visible = new Set(visibleCodes);
    const indicators = dataset.indicators.filter(i => visible.has(i.code));
    const evaluated = indicators.filter(i => i.score !== null);
    const plans = indicators.filter(i => i.score === 0 || i.score === 1 || i.action || i.history?.length);
    const percent = list => list.length ? Math.round(list.reduce((sum, i) => sum + i.score, 0) / (list.length * 2) * 100) + '%' : 'Sin evaluar';
    const content = [{text: 'WASH FIT - Reporte consolidado', style: 'title'}, line('Generado', new Date(dataset.savedAt).toLocaleString('es-PE', {timeZone: 'America/Lima'})), line('Fecha de evaluación', g.evaluationDate)];
    const step = (number, title) => content.push({text: `Paso ${number}: ${title}`, style: 'heading', ...(number > 1 ? {pageBreak: 'before'} : {})});
    step(1, 'Datos Generales');
    for (const [name, x] of [['Nombre', g.facilityName], ['Ciudad / país', g.district], ['Nivel', g.level], ['Tipo / ámbito', `${g.type} / ${g.setting}`], ['Población', g.populationServed], ['Coordenadas', `${value(g.latitude)}, ${value(g.longitude)}`], ['Grupos etarios', `<5: ${value(g.ageGroups.under5)}; 5-17: ${value(g.ageGroups.age5to17)}; 18-59: ${value(g.ageGroups.over18to59)}; 60+: ${value(g.ageGroups.over60)}`]]) content.push(line(name, x));
    if (Number.isFinite(g.latitude) && Number.isFinite(g.longitude)) content.push({text: 'Ver ubicación en OpenStreetMap', link: `https://www.openstreetmap.org/?mlat=${g.latitude}&mlon=${g.longitude}#map=14/${g.latitude}/${g.longitude}`, color: '#004C97', margin: [0, 5, 0, 5]});
    content.push({text: 'Equipo implementador', style: 'subheading'}, table(['Nombre', 'Cargo / institución', 'Responsabilidad', 'Correo'], g.team.map(m => [value(m.name), `${value(m.role)} / ${value(m.institution)}`, value(m.responsibility), value(m.email)])), line('Resumen y conclusiones', g.summary));
    for (const photo of g.photos) content.push({image: photo.url, fit: [650, 220], margin: [0, 10, 0, 3]}, {text: value(photo.name), fontSize: 8});
    step(2, 'Evaluación de la Situación');
    content.push(table(['Dominio', 'Indicador', 'Resultado', 'Hallazgos'], indicators.map(i => [i.module, i.title, Core.assessmentResult(i).label, value(i.notes)]), [80, '*', 85, 100]));
    step(3, 'Evaluación del Riesgo');
    content.push({text: 'Riesgo = gravedad + probabilidad (0-20).'}, table(['Módulo', 'Indicador', 'Resultado', 'Problema', 'Riesgos asociados', 'Gravedad', 'Probabilidad', 'Riesgo'], evaluated.map(i => [i.module, i.title, Core.assessmentResult(i).label, value(i.problemDesc), value(i.associatedRisks), value(i.severity), value(i.likelihood), riskText(i)]), [55, '*', 65, 115, 115, 40, 50, 55]));
    step(4, 'Plan de Mejora');
    content.push(table(['Módulo', 'Indicador / resultado / riesgo', 'Problema', 'Acción', 'Recursos', 'Responsables', 'Plazo', 'Costo USD', 'Estado'], plans.map(i => [i.module,i.title+'\n'+Core.assessmentResult(i).label+'\nRiesgo: '+riskText(i), value(i.problemDesc), value(Core.reviewBullets(i.action)), value(Core.reviewBullets(i.resources)), value(Core.reviewBullets(Core.responsibleName(i,g.team))), value(i.targetDate), value(i.cost), Core.trackingStatus(i)]), [55,'*',65,85,65,65,50,35,50]));
    step(5, 'Monitoreo y Revisión');
    content.push(table(['Módulo', 'Indicador', 'Acción en seguimiento', 'Cambio', 'Medidas correctivas', 'Próxima revisión', 'Comentarios'], plans.map(i => [i.module,i.title,value(Core.reviewBullets(i.action)),Core.changeLabel(i.indicatorChange),value(Core.reviewBullets(i.correctiveMeasures)),value(i.nextReviewDate),value(Core.reviewBullets(i.monitoringComments))]), [55,'*',90,65,100,60,100]));
    const history=plans.flatMap(i => (i.history || []).map(h => [i.module,i.title,new Date(h.recordedAt).toLocaleString('es-PE',{timeZone:'America/Lima'})+'\nPróxima: '+value(h.nextReviewDate),Core.changeLabel(h.indicatorChange),Core.reviewHistoryText(h,'responsible'),value(Core.reviewBullets(h.action)),Core.reviewHistoryText(h,'correctiveMeasures'),Core.reviewHistoryText(h,'monitoringComments')]));
    if(history.length) content.push({text:'Historial de revisiones',style:'subheading'},table(['Módulo','Indicador','Revisión / próxima','Cambio','Responsables','Acción','Medidas','Comentarios'],history,[55,'*',80,60,60,75,90,90]));
    step(6, 'Resumen');
    const compliance = evaluated.length ? Math.round(evaluated.reduce((n, i) => n + i.score, 0) / (evaluated.length * 2) * 100) : 0;
    content.push(line('Cobertura', `${evaluated.length}/${indicators.filter(i => !Core.isNotApplicable(i)).length} aplicables evaluados`), line('Cumplimiento Global', percent(evaluated)), line('Valoración', Core.valuation(evaluated.length, indicators.length, compliance).label));
    content.push(table(['Dominio', 'Indicadores', 'Respondidos', 'Puntos', 'Cumplimiento'], modules.map(m => { const all = indicators.filter(i => i.moduleId === m.id && !Core.isNotApplicable(i)); const done = all.filter(i => i.score !== null); return [m.name, String(all.length), String(done.length), String(done.reduce((n, i) => n + i.score, 0)), percent(done)]; })));
    const jmp = Core.calculateJmp(g, dataset.indicators);
    content.push({text: 'Servicios JMP', style: 'subheading'}, table(['Agua', 'Saneamiento', 'Residuos', 'Higiene', 'Limpieza'], [[jmp.water.status, jmp.sanitation.status, jmp.waste.status, jmp.hygiene.status, jmp.cleaning.status]]));
    content.push({stack:[{text:'Porcentaje de desempeño por dominio (Radar)',style:'subheading'},{svg:Radar.svg(indicators,modules),width:650,alignment:'center'},{text:'Cumplimiento de los indicadores respondidos. Los dominios pendientes se muestran como Sin evaluar.',fontSize:8}],unbreakable:true});
    return {info: {title: `WASH FIT - ${g.facilityName || 'Sin nombre'}`, subject: 'Reporte de evaluación WASH FIT'}, pageSize: 'A4', pageOrientation: 'landscape', pageMargins: [30, 30, 30, 35], defaultStyle: {font: 'Roboto', fontSize: 9}, styles: {title: {fontSize: 20, bold: true, color: '#004C97', margin: [0, 0, 0, 10]}, heading: {fontSize: 15, bold: true, color: '#004C97', margin: [0, 8, 0, 10]}, subheading: {fontSize: 11, bold: true, margin: [0, 10, 0, 5]}}, footer: (page, total) => ({text: `WASH FIT | ${page} / ${total}`, alignment: 'right', margin: [30, 0, 30, 0], fontSize: 8}), content};
  }
  return {definition};
});
