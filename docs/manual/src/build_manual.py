# -*- coding: utf-8 -*-
"""Genera el manual de Sentryx para la Representante Legal y la Rectoría (PDF)."""
import os, sys
from PIL import Image
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Image as RLImage, Table,
                                TableStyle, PageBreak, KeepTogether, NextPageTemplate, ListFlowable, ListItem, CondPageBreak)

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS = os.path.join(HERE, 'manual')
OUT = sys.argv[1]
TMP = os.path.join(HERE, 'manual_tmp')
os.makedirs(TMP, exist_ok=True)

F = 'C:/Windows/Fonts/'
pdfmetrics.registerFont(TTFont('UI', F + 'segoeui.ttf'))
pdfmetrics.registerFont(TTFont('UI-B', F + 'segoeuib.ttf'))
pdfmetrics.registerFont(TTFont('UI-SB', F + 'seguisb.ttf'))
pdfmetrics.registerFont(TTFont('UI-I', F + 'segoeuii.ttf'))
pdfmetrics.registerFont(TTFont('UI-BL', F + 'seguibl.ttf'))
pdfmetrics.registerFontFamily('UI', normal='UI', bold='UI-B', italic='UI-I', boldItalic='UI-B')

BLUE = colors.HexColor('#0B78FB')
ORANGE = colors.HexColor('#F6950A')
INK = colors.HexColor('#111111')
GRAY = colors.HexColor('#5B6573')
LIGHT = colors.HexColor('#F3F5F8')
LINE = colors.HexColor('#DDE2E8')
INFO_BG = colors.HexColor('#EAF3FF')
WARN_BG = colors.HexColor('#FFF4E2')

S = {
    'h1': ParagraphStyle('h1', fontName='UI-BL', fontSize=22, leading=27, textColor=INK, spaceBefore=18, spaceAfter=10),
    'h2': ParagraphStyle('h2', fontName='UI-B', fontSize=14, leading=18, textColor=INK, spaceBefore=12, spaceAfter=6),
    'h3': ParagraphStyle('h3', fontName='UI-SB', fontSize=11.5, leading=15, textColor=INK, spaceBefore=8, spaceAfter=3),
    'p': ParagraphStyle('p', fontName='UI', fontSize=10.3, leading=15, textColor=INK, spaceAfter=6),
    'lead': ParagraphStyle('lead', fontName='UI', fontSize=12, leading=18, textColor=GRAY, spaceAfter=10),
    'small': ParagraphStyle('small', fontName='UI', fontSize=8.8, leading=12, textColor=GRAY),
    'cap': ParagraphStyle('cap', fontName='UI-I', fontSize=8.6, leading=11, textColor=GRAY, alignment=TA_CENTER, spaceBefore=3, spaceAfter=10),
    'cell': ParagraphStyle('cell', fontName='UI', fontSize=9.2, leading=12.5, textColor=INK),
    'cellb': ParagraphStyle('cellb', fontName='UI-SB', fontSize=9.2, leading=12.5, textColor=INK),
    'cellh': ParagraphStyle('cellh', fontName='UI-B', fontSize=8.8, leading=12, textColor=colors.white),
    'box': ParagraphStyle('box', fontName='UI', fontSize=9.8, leading=14, textColor=INK),
}
W = A4[0] - 4 * cm  # ancho útil


def P(text, style='p'):
    return Paragraph(text, S[style])


def bullets(items, style='p'):
    return ListFlowable([ListItem(P(t, style), leftIndent=12, value='•') for t in items], bulletType='bullet', start='•',
                        leftIndent=14, bulletFontName='UI-B', bulletColor=BLUE, spaceAfter=6)


def steps(items):
    return ListFlowable([ListItem(P(t), leftIndent=16) for t in items], bulletType='1', bulletFontName='UI-B',
                        bulletColor=BLUE, leftIndent=18, spaceAfter=6)


def box(text, kind='info'):
    t = Table([[P(text, 'box')]], colWidths=[W])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), INFO_BG if kind == 'info' else WARN_BG),
        ('LINEBEFORE', (0, 0), (0, -1), 3, BLUE if kind == 'info' else ORANGE),
        ('LEFTPADDING', (0, 0), (-1, -1), 10), ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 7), ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
    ]))
    return KeepTogether([t, Spacer(1, 8)])


def table(rows, widths, header=True):
    data = [[P(c, 'cellh' if (header and i == 0) else ('cellb' if j == 0 else 'cell')) for j, c in enumerate(r)] for i, r in enumerate(rows)]
    t = Table(data, colWidths=[w * W for w in widths], repeatRows=1 if header else 0)
    style = [
        ('GRID', (0, 0), (-1, -1), 0.5, LINE),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6), ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, LIGHT]),
    ]
    if header:
        style.append(('BACKGROUND', (0, 0), (-1, 0), INK))
    t.setStyle(TableStyle(style))
    return KeepTogether([t, Spacer(1, 10)]) if len(rows) < 14 else t


def shot(name, caption, width=W, crop_phone=False, inline=False):
    src = os.path.join(SHOTS, name + '.png')
    img = Image.open(src)
    if crop_phone:
        img = img.crop((0, 0, 780, img.height))
    # Borde fino para separar la captura del papel.
    framed = Image.new('RGB', (img.width + 4, img.height + 4), (221, 226, 232))
    framed.paste(img.convert('RGB'), (2, 2))
    out = os.path.join(TMP, name + '.jpg')
    framed.save(out, quality=86, optimize=True)
    h = width * framed.height / framed.width
    parts = [RLImage(out, width=width, height=h), P(caption, 'cap')]
    # Dentro de una celda de tabla va como lista simple (KeepTogether no se mide bien ahí).
    return parts if inline else KeepTogether(parts)


def phones(pairs):
    """Dos capturas de celular lado a lado."""
    cells = []
    for name, caption in pairs:
        cells.append(shot(name, caption, width=5.6 * cm, crop_phone=True, inline=True))
    while len(cells) < 2:
        cells.append(Spacer(1, 1))
    t = Table([cells], colWidths=[W / 2, W / 2])
    t.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('ALIGN', (0, 0), (-1, -1), 'CENTER')]))
    return t


# ---------------- Páginas: portada y resto ----------------

def cover(c, doc):
    w, h = A4
    c.saveState()
    c.setFillColor(colors.black)
    c.rect(0, 0, w, h, fill=1, stroke=0)
    # Marca: círculo azul con aguja naranja (como el ícono de la app).
    cx, cy, r = 2.6 * cm, h - 4.2 * cm, 0.9 * cm
    c.setStrokeColor(BLUE)
    c.setLineWidth(5)
    c.arc(cx - r, cy - r, cx + r, cy + r, startAng=-60, extent=300)
    c.setFillColor(ORANGE)
    p = c.beginPath()
    p.moveTo(cx, cy + r * 0.95); p.lineTo(cx - 0.12 * cm, cy + 0.15 * cm); p.lineTo(cx, cy); p.lineTo(cx + 0.12 * cm, cy + 0.15 * cm); p.close()
    c.drawPath(p, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont('UI-BL', 30)
    c.drawString(3.9 * cm, h - 4.55 * cm, 'Sentryx')
    c.setFillColor(ORANGE)
    c.drawString(3.9 * cm + pdfmetrics.stringWidth('Sentryx', 'UI-BL', 30), h - 4.55 * cm, '.')

    c.setFillColor(colors.white)
    c.setFont('UI-BL', 40)
    c.drawString(2 * cm, h / 2 + 2.2 * cm, 'Manual de uso')
    c.setFont('UI', 17)
    c.setFillColor(colors.HexColor('#E0E0E0'))
    c.drawString(2 * cm, h / 2 + 0.9 * cm, 'La plataforma escolar para comunicarse, enseñar y gestionar')
    c.drawString(2 * cm, h / 2 + 0.1 * cm, 'Inicial, Primario y Secundario en un solo lugar.')
    # Banda de colores
    c.setFillColor(BLUE)
    c.rect(2 * cm, h / 2 - 1.1 * cm, 5 * cm, 0.18 * cm, fill=1, stroke=0)
    c.setFillColor(ORANGE)
    c.rect(7 * cm, h / 2 - 1.1 * cm, 2 * cm, 0.18 * cm, fill=1, stroke=0)

    c.setFont('UI-SB', 12.5)
    c.setFillColor(colors.white)
    c.drawString(2 * cm, 6.2 * cm, 'Colegio Demo Sentryx')
    c.setFont('UI', 11)
    c.setFillColor(colors.HexColor('#A0A0A0'))
    c.drawString(2 * cm, 5.5 * cm, 'Para la Representante Legal, la Rectoría y la Dirección.')
    c.drawString(2 * cm, 4.9 * cm, 'Segunda edición · Octubre de 2026')
    c.setFont('UI-B', 11)
    c.setFillColor(colors.white)
    c.drawString(2 * cm, 2.2 * cm, 'SRV')
    c.setFont('UI', 10)
    c.setFillColor(colors.HexColor('#A0A0A0'))
    c.drawString(2.9 * cm, 2.2 * cm, '· wearesrv.com')
    c.restoreState()


def page(c, doc):
    w, h = A4
    c.saveState()
    c.setFont('UI-B', 8.5)
    c.setFillColor(INK)
    c.drawString(2 * cm, h - 1.3 * cm, 'Sentryx')
    c.setFillColor(ORANGE)
    c.drawString(2 * cm + pdfmetrics.stringWidth('Sentryx', 'UI-B', 8.5), h - 1.3 * cm, '.')
    c.setFont('UI', 8.5)
    c.setFillColor(GRAY)
    c.drawRightString(w - 2 * cm, h - 1.3 * cm, 'Manual de uso · Colegio Demo Sentryx')
    c.setStrokeColor(LINE)
    c.setLineWidth(0.6)
    c.line(2 * cm, h - 1.5 * cm, w - 2 * cm, h - 1.5 * cm)
    c.drawRightString(w - 2 * cm, 1.2 * cm, str(doc.page))
    c.drawString(2 * cm, 1.2 * cm, 'SRV · wearesrv.com')
    c.restoreState()


doc = BaseDocTemplate(OUT, pagesize=A4, leftMargin=2 * cm, rightMargin=2 * cm, topMargin=2.1 * cm, bottomMargin=1.9 * cm,
                      title='Sentryx · Manual de uso · Colegio Demo Sentryx', author='SRV', subject='Manual para la Representante Legal y la Rectoría')
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id='f')
doc.addPageTemplates([PageTemplate(id='cover', frames=[frame], onPage=cover), PageTemplate(id='page', frames=[frame], onPage=page)])

# -*- coding: utf-8 -*-
# Contenido del manual v2 (se concatena al encabezado de build_manual.py: estilos, helpers, portada).

story = [NextPageTemplate('page'), PageBreak()]

# ---------------- Índice ----------------
story += [P('Contenido', 'h1')]
toc = [
    ('1', 'Qué es Sentryx'), ('2', 'Cómo se ingresa: web, app del celular y primer acceso'), ('3', 'Usuarios de prueba'),
    ('4', 'Roles: quién ve y hace qué'), ('5', 'Inicio y buscador'), ('6', 'Comunicados'), ('7', 'Mensajes y canales de curso'),
    ('8', 'Aulas: materiales, tareas, TP y evaluaciones'), ('9', 'Calificaciones y boletines'), ('10', 'Asistencia y alertas'),
    ('11', 'Estadísticas por curso'), ('12', 'Ficha del alumno'), ('13', 'Administración del colegio'), ('14', 'Archivos'),
    ('15', 'Facturación y planes'), ('16', 'Seguridad y privacidad'), ('17', 'Soporte'), ('18', 'Novedades de esta edición'),
    ('19', 'Recorrido sugerido para evaluar Sentryx'), ('20', 'Preguntas frecuentes'),
]
story += [table([[n, t] for n, t in toc], [0.08, 0.92], header=False)]
story += [box('<b>Cómo usar este manual.</b> Las secciones 1 a 4 explican qué es Sentryx, cómo se entra y quién hace qué. Las secciones 5 a 17 recorren cada función con capturas reales del <b>Colegio Demo Sentryx</b>. La sección 18 resume lo nuevo de esta edición y la 19 propone un recorrido de 25 minutos para evaluarlo con los usuarios de prueba.')]
story += [PageBreak()]

# ---------------- 1 ----------------
story += [P('1. Qué es Sentryx', 'h1'),
          P('Sentryx es la plataforma del colegio para que la conducción, los docentes, las familias y los estudiantes se comuniquen y sigan la vida escolar en un mismo lugar. Funciona en la computadora, en el navegador del celular y como <b>app para iPhone y Android</b>, y está pensada para un colegio con <b>Inicial, Primario y Secundario</b>.', 'lead'),
          P('En una sola herramienta', 'h2'),
          bullets([
              '<b>Comunicados</b> para toda la institución, un nivel, un curso o familias elegidas una por una, con confirmación de lectura, borradores, envíos programados y seguimiento de quién leyó.',
              '<b>Mensajes</b> privados entre las familias y la escuela, y <b>canales de curso</b> moderados en Secundario.',
              '<b>Aulas</b> por curso con materiales, tareas, trabajos prácticos y evaluaciones con fecha.',
              '<b>Calificaciones y boletines</b> con el esquema que elija cada nivel (números, letras, informes o mixto), que las familias ven solo cuando la escuela los publica; los boletines de años anteriores se conservan.',
              '<b>Asistencia</b> diaria desde la computadora o el celular (también sin señal) y <b>alertas automáticas</b> de faltas.',
              '<b>Estadísticas por curso</b>: asistencia, llegadas tarde y promedios, con gráficos por mes y por materia.',
              '<b>Administración</b>: estructura, personal con uno o varios roles, roles personalizados, alumnos y familias, ciclo lectivo, auditoría y facturación.',
              'Un <b>buscador</b> que entiende "notas", "faltas" o "boletín" y lleva directo a la pantalla.',
          ]),
          P('Para quién', 'h2'),
          table([
              ['Quién', 'Qué resuelve'],
              ['Conducción', 'Ve todo su nivel (o todo el colegio), envía comunicados, sigue alertas y estadísticas, publica boletines, define cómo se califica en su nivel y configura el colegio.'],
              ['Docentes', 'Cargan notas y toman asistencia de sus cursos, publican material, TP y evaluaciones en sus aulas y responden mensajes de las familias.'],
              ['Preceptoría / Jefatura', 'Toma asistencia, justifica inasistencias, atiende alertas y modera los canales de sus cursos (la Jefatura, de todo su nivel).'],
              ['Secretaría / Administración', 'Altas de personal, alumnos y familias; comunicados a toda la institución o a familias elegidas; legajos y recibos.'],
              ['Familias', 'Reciben comunicados, ven el boletín, la asistencia y la agenda de evaluaciones de sus hijos y escriben a la escuela desde el celular.'],
              ['Estudiantes (Secundario)', 'Con cuenta propia: su boletín, sus aulas, el canal de su curso, los juegos y mensajes con sus docentes.'],
          ], [0.26, 0.74]),
          CondPageBreak(9 * cm)]

# ---------------- 2 ----------------
story += [P('2. Cómo se ingresa: web, app del celular y primer acceso', 'h1'),
          P('Cada colegio tiene su propio link de ingreso, con su nombre y su escudo. Las personas ingresan con su <b>email o DNI</b> y su contraseña, desde la computadora, el navegador del celular o la app.'),
          P('Primer acceso sin copiar nada', 'h2'),
          steps([
              'Al dar de alta a una persona, Sentryx le manda un mail de bienvenida con su usuario y una contraseña temporal.',
              'El botón <b>Ingresar ahora</b> del mail abre la pantalla de ingreso <b>con el usuario y la contraseña ya cargados</b>: solo hay que tocar <i>Ingresar</i>.',
              'La primera vez, Sentryx pide elegir una contraseña propia (mínimo 8 caracteres).',
              'Si alguien se olvida la contraseña, usa <b>¿Olvidaste tu contraseña?</b> o Secretaría se la blanquea desde su ficha (le llega otro mail con el mismo botón).',
          ]),
          phones([('p_login', 'Pantalla de ingreso del colegio.'), ('p_inicio_familia', 'Inicio de una familia: comunicados sin leer, mensajes y el resumen de su hijo/a.')]),
          P('La app Sentryx para el celular', 'h2'),
          P('Además del navegador, hay una <b>app para iPhone y Android</b> pensada para celulares sencillos: abre al instante (guarda lo último que vio aunque no haya señal), gasta poca batería y recibe notificaciones. Tiene lo que se usa a diario: inicio, comunicados con buscador y filtros, mensajes en tiempo real, boletín y asistencia de los hijos y, para docentes y preceptoría, <b>tomar asistencia</b>. Si se toma lista sin señal, queda guardada en el celular y se envía sola cuando vuelve la conexión. La administración del colegio sigue en la web: desde la app se abre con un toque.'),
          P('Si prefieren no instalar nada', 'h2'),
          bullets([
              '<b>Android (Chrome):</b> menú ⋮ → <i>Instalar app</i> o <i>Agregar a la pantalla de inicio</i>.',
              '<b>iPhone (Safari):</b> botón Compartir → <i>Agregar a inicio</i>. En iPhone este paso es necesario para recibir notificaciones desde el navegador.',
              'Después tocá <b>Activar</b> en el aviso de notificaciones. Quien no tenga notificaciones activas recibe los avisos importantes por email.',
          ]),
          box('<b>Selector de nivel.</b> Quien conduce más de un nivel (por ejemplo la Representante Legal) elige arriba a la izquierda <i>Todos los niveles</i>, Inicial, Primario o Secundario. Toda la app se filtra a ese nivel; los permisos no cambian.'),
          CondPageBreak(9 * cm)]

# ---------------- 3 ----------------
story += [P('3. Usuarios de prueba', 'h1'),
          P('El Colegio Demo Sentryx tiene los tres niveles cargados con cursos, materias, docentes, alumnos, familias, notas, asistencia, comunicados y mensajes de ejemplo. Hay <b>un usuario por cada rol</b> para ver la plataforma desde el lugar de cada persona.'),
          table([
              ['Rol', 'Usuario', 'Qué muestra'],
              ['Representante Legal', 'representante@demo.wearesrv.com', 'Todo el colegio, la configuración, los planes y la facturación.'],
              ['Rectoría (Secundario)', 'rectora@demo.wearesrv.com', 'Conducción de Secundario: comunicados, alertas, estadísticas, boletines y cómo se califica en su nivel.'],
              ['Dirección (Primario)', 'directora@demo.wearesrv.com', 'Conducción de Primario.'],
              ['Vicedirección (Primario)', 'vicedirectora@demo.wearesrv.com', 'Acompaña a la conducción; no modifica la estructura.'],
              ['Secretaría', 'secretaria@demo.wearesrv.com', 'Altas de personal, alumnos y familias; comunicados a toda la institución.'],
              ['Administración', 'administracion@demo.wearesrv.com', 'Familias, comunicados a familias elegidas, legajos y recibos (no ve notas).'],
              ['Preceptoría (Secundario)', 'preceptora@demo.wearesrv.com', 'Asistencia, alertas y canales de sus cursos.'],
              ['Docente', 'docente1@demo.wearesrv.com', 'Sus materias: notas, asistencia, aulas y mensajes.'],
              ['Familia (Inicial)', 'familia1@demo.wearesrv.com', 'Un hijo en Sala de 5.'],
              ['Familia (Secundario)', 'familia25@demo.wearesrv.com', 'Una hija en 5º 1ª, con una conversación con preceptoría.'],
              ['Estudiante (Secundario)', 'estudiante7@demo.wearesrv.com', 'Su boletín, sus aulas y el canal de su curso.'],
          ], [0.25, 0.37, 0.38]),
          box('<b>Contraseña:</b> la misma para todos los usuarios de prueba. Por seguridad no figura en este documento: se entrega por separado junto con el link de ingreso.', 'warn'),
          P('Además hay más docentes (docente1 a docente8), más familias y más estudiantes con el mismo formato, por si quieren probar con varias personas a la vez.', 'small'),
          CondPageBreak(9 * cm)]

# ---------------- 4 ----------------
story += [P('4. Roles: quién ve y hace qué', 'h1'),
          P('Cada persona tiene <b>uno o más roles</b> en el colegio. Cada rol tiene permisos concretos (acciones sobre algo: ver notas, publicar boletines, tomar asistencia…) y un alcance (todo el colegio, un nivel o ciertos cursos). Cada persona ve solo lo que le corresponde.'),
          table([
              ['Rol', 'Alcance', 'Puede'],
              ['Representante Legal', 'Todo el colegio', 'Todo: configuración, personal, alumnos, comunicados, boletines, planes, facturación y auditoría.'],
              ['Dirección / Rectoría', 'Su nivel', 'Conducción: comunicados, notas (ver y corregir), cerrar períodos, <b>publicar boletines</b>, definir cómo se califica en su nivel, alertas, estadísticas, personal, alumnos y roles personalizados.'],
              ['Vicedirección', 'Su nivel', 'Lo mismo que la conducción, salvo modificar la estructura del colegio.'],
              ['Coordinación pedagógica', 'Su nivel', 'Como Vicedirección, pero sin publicar boletines ni crear roles.'],
              ['Secretaría', 'Todo el colegio', 'Altas de personal, alumnos y familias; comunicados a toda la institución; ve notas y asistencia (no publica boletines).'],
              ['Administración', 'Todo el colegio', 'Familias, comunicados (incluso a familias elegidas una por una), legajos y recibos de sueldo. No ve notas.'],
              ['Jefatura de preceptores', 'Su nivel', 'Todo lo de Preceptoría, en todas las divisiones de su nivel.'],
              ['Preceptoría', 'Sus cursos', 'Tomar y corregir asistencia, atender alertas, comunicados a sus cursos y moderar canales.'],
              ['Docente', 'Sus materias y cursos', 'Cargar notas y tomar asistencia de sus cursos, publicar material, TP y evaluaciones, juegos y programas solo en sus materias; comunicados a sus cursos; mensajes. No ve los datos de contacto de las familias ni otros cursos.'],
              ['Familia', 'Sus hijos', 'Comunicados, boletín publicado, asistencia, agenda, aulas y mensajes con la escuela.'],
              ['Estudiante', 'Su curso', 'Su boletín publicado, sus aulas, el canal de su curso, juegos y mensajes con sus docentes.'],
          ], [0.22, 0.16, 0.62]),
          P('Varios roles en una misma persona', 'h2'),
          P('Es común que alguien sea <b>Secretaría y Preceptoría</b>, o <b>Dirección y Docente</b>. No hace falta elegir ni cambiar de rol: la persona entra con una sola cuenta y ve y puede hacer <b>todo lo que permite cada rol, con el alcance de ambos sumado</b> (la preceptora que además es secretaria toma asistencia y da de alta alumnos). Se agrega desde <i>Administración → Personal</i>, botón <b>Otro rol</b> en la persona.'),
          P('Roles personalizados', 'h2'),
          P('Si un cargo no está en el catálogo ("Coordinación de deportes", "Bibliotecaria"), la conducción lo crea desde <b>Administración → Roles y permisos → Nuevo rol</b>: le pone nombre, elige si es directivo o docente, puede partir de los permisos de un rol existente y tilda las acciones concretas que le corresponden. Solo se pueden dar permisos que uno mismo tiene y con jerarquía menor a la propia; después se asigna como cualquier otro rol.'),
          shot('d_roles', 'Roles y permisos: catálogo, roles personalizados del colegio y matriz de permisos.'),
          box('Solo se otorgan roles de menor jerarquía que el propio: por ejemplo, Secretaría puede dar de alta docentes pero no directivos.'),
          CondPageBreak(9 * cm)]

# ---------------- 5 ----------------
story += [P('5. Inicio y buscador', 'h1'),
          P('Al entrar, cada persona ve un resumen de lo pendiente: comunicados sin leer, conversaciones nuevas, alertas de asistencia, si ya se tomó asistencia hoy y las <b>próximas evaluaciones y entregas</b>. Desde los accesos rápidos se va directo a lo más usado según el rol.'),
          shot('d_inicio', 'Inicio de la Rectoría.'),
          P('"¿Dónde estaba eso?": el buscador', 'h2'),
          P('En la barra de arriba (o con <b>Ctrl+K</b>) se escribe lo que se busca tal como se diría: <i>notas</i>, <i>faltas</i>, <i>boletín</i>, <i>pasar de grado</i>, <i>cuota</i>. Aparece un desplegable con las pantallas que corresponden (solo las que esa persona puede usar) y, para el personal, alumnos y personas por nombre. Enter abre el primer resultado. La página <b>Ayuda</b> del menú tiene el índice completo por sección.'),
          shot('d_ayuda', 'Ayuda e índice: todo lo que se puede hacer, con buscador.'),
          CondPageBreak(9 * cm)]

# ---------------- 6 ----------------
story += [P('6. Comunicados', 'h1'),
          P('Los comunicados reemplazan al cuaderno de comunicaciones y a los grupos de WhatsApp: llegan a quien corresponde y queda registrado quién los leyó.'),
          P('Enviar un comunicado', 'h2'),
          bullets([
              '<b>Destinatarios:</b> toda la institución, un nivel, uno o varios cursos, solo el personal o <b>familias elegidas una por una</b>: un listado completo de las familias (con sus hijos, curso y contacto) con buscador y filtros por nivel, grado/año y división, y un botón para seleccionar todas las filtradas (por ejemplo, todo 3º año). Es lo que usa Administración para los avisos de cuotas o trámites.',
              '<b>Urgente:</b> se destaca en rojo y llega también por email a quien no tenga notificaciones activas.',
              '<b>Pedir confirmación:</b> la familia confirma con un toque que lo recibió (autorizaciones, salidas, suspensiones).',
              '<b>Adjuntos:</b> PDF, fotos y documentos.',
              '<b>Guardar como borrador</b> para terminarlo después, o <b>programar el envío</b> para una fecha y hora: sale solo, aunque nadie esté conectado. Hasta entonces se puede editar o cancelar.',
          ]),
          shot('d_comunicado_nuevo', 'Nuevo comunicado: destinatarios, confirmación, urgencia, borrador o envío programado.'),
          P('Bandeja, búsqueda y archivo', 'h2'),
          P('La bandeja tiene buscador por título o texto y filtros: <i>sin leer</i>, <i>pendientes de confirmar</i>, <i>urgentes</i>, <i>con adjuntos</i>, <i>archivados</i> y rango de fechas. En <i>Enviados</i> se ve el estado de cada uno (borrador, programado, enviado, archivado). <b>Archivar</b> un comunicado lo saca de la bandeja de todos sin borrarlo.'),
          shot('d_comunicados', 'Bandeja de comunicados con buscador y filtros.'),
          P('Seguimiento', 'h2'),
          P('En cada comunicado enviado se ve cuántas personas lo leyeron y cuántas confirmaron, con el detalle de cada familia. Con <b>Recordar a pendientes</b> se reenvía el aviso solo a quienes todavía no lo leyeron o no confirmaron.'),
          shot('d_comunicado_lecturas', 'Comunicado urgente con confirmación: quién leyó y quién confirmó.'),
          phones([('p_comunicados', 'La bandeja en el celular, con buscador y filtros.'), ('p_comunicado', 'Así lo ve la familia, con el botón para confirmar.')]),
          CondPageBreak(9 * cm)]

# ---------------- 7 ----------------
story += [P('7. Mensajes y canales de curso', 'h1'),
          P('Mensajes', 'h2'),
          P('Son conversaciones privadas, siempre <b>sobre un alumno</b>, entre la familia y la escuela. Una familia puede escribirles a los docentes de su hijo/a, a la preceptoría de su curso, a la conducción de su nivel y a Secretaría; no ve ni contacta a otras familias.'),
          bullets([
              'El personal puede <b>sumar a otra persona</b> a la conversación (derivar a la Dirección) y <b>cerrarla</b> cuando el tema quedó resuelto.',
              'Llegan al instante al celular; se pueden adjuntar archivos.',
              'Todo queda dentro de la plataforma: no hace falta compartir teléfonos personales.',
          ]),
          P('Canales de curso (Secundario)', 'h2'),
          P('Cada curso de Secundario tiene un canal <b>General</b> y uno por materia, donde participan los estudiantes con cuenta y sus docentes. Preceptoría y conducción los leen y los moderan: pueden ocultar mensajes y silenciar temporalmente a un estudiante. No existen mensajes privados entre estudiantes.'),
          phones([('p_mensaje', 'Una conversación entre una familia y preceptoría.'), ('p_canal', 'Canal General de 5º 1ª visto por un estudiante.')]),
          CondPageBreak(9 * cm)]

# ---------------- 8 ----------------
story += [P('8. Aulas: materiales, tareas, TP y evaluaciones', 'h1'),
          P('Cada curso es un aula. Los docentes publican por materia <b>materiales</b> (archivos, fotos, links y videos de YouTube), <b>tareas</b>, <b>trabajos prácticos</b> con fecha de entrega y <b>evaluaciones</b> con fecha. Lo que tiene fecha aparece en la <b>agenda del curso</b> y en el inicio de las familias, los estudiantes y los docentes ("Próximas evaluaciones y entregas"). También se pueden asignar <b>juegos de preguntas</b> (en vivo con PIN y QR, o como tarea).'),
          box('Un docente solo puede publicar, cargar notas y asignar juegos <b>en sus propias materias y cursos</b>. Rectoría y Dirección pueden hacerlo en cualquier curso de su nivel.'),
          shot('d_aula', 'Aula de 2º 1ª vista por un docente: agenda con la evaluación y el TP, y el muro por materia.'),
          CondPageBreak(9 * cm)]

# ---------------- 9 ----------------
story += [P('9. Calificaciones y boletines', 'h1'),
          P('Cómo califica cada nivel', 'h2'),
          P('Cada nivel tiene un <b>modo de calificación por defecto</b> que define su conducción desde <i>Administración → Calificaciones</i>, y que después se puede ajustar período por período:'),
          table([
              ['Modo', 'Qué significa'],
              ['Solo números', 'Todos los períodos con nota numérica (por ejemplo 1 a 10, aprueba con 6). La final anual es el promedio.'],
              ['Solo letras', 'Todos los períodos con la escala de palabras del nivel (por ejemplo Sobresaliente → Insuficiente). Sin promedio.'],
              ['Informes', 'Cada período es un informe escrito por materia o por sala (el habitual en Inicial).'],
              ['Mixto', 'El clásico de Secundario: bimestres impares con letras, pares numéricos, y opcionalmente la nota de cuatrimestre.'],
          ], [0.2, 0.8]),
          P('Por defecto: Inicial informes, Primario letras, Secundario mixto. En la misma pantalla se editan la escala de letras, el rango numérico, la nota de aprobación y cuánto vale cada tipo de inasistencia. Cualquier período se puede cambiar a números, letras o informe mientras no tenga notas cargadas.'),
          shot('d_calificaciones', 'Administración → Calificaciones: modo por nivel, escala, rangos y períodos.'),
          P('Nota de cuatrimestre (Secundario)', 'h2'),
          P('Además de las notas de cada bimestre, la Rectoría puede agregar una <b>nota de cierre por cuatrimestre</b> que carga el docente (la planilla le sugiere el promedio de los bimestres). Con esa opción, la final anual pasa a ser el promedio de las dos notas de cuatrimestre. Sus fechas abarcan el cuatrimestre entero: es normal que se superpongan con las de los bimestres.'),
          P('Planilla y boletín', 'h2'),
          bullets([
              'El docente carga las notas de sus materias en una planilla por curso. Con la <b>carga rápida</b> pone la misma valoración a todos y después corrige uno por uno. Puede agregar una observación por alumno.',
              'La conducción ve y corrige cualquier nota de su nivel y <b>cierra los períodos</b> para que no se modifiquen más.',
              'El boletín se <b>publica por curso y período</b> y recién ahí lo ven las familias y los estudiantes. <b>Publicar es decisión de la conducción</b> (Representante Legal, Dirección, Rectoría, Vicedirección); Secretaría lee notas pero no publica.',
              'Al pasar de grado, las notas quedan guardadas: en la ficha del alumno hay un <b>selector de ciclo</b> para ver e imprimir el boletín de años anteriores.',
          ]),
          shot('d_notas', 'Planilla de notas de un docente (Lengua y Literatura, 2º 1ª).'),
          CondPageBreak(9 * cm)]

# ---------------- 10 ----------------
story += [P('10. Asistencia y alertas', 'h1'),
          P('Preceptoría, la Jefatura de preceptores o la <b>docente del curso</b> toman asistencia en pocos toques: <b>Presente</b>, <b>Ausente</b>, <b>Tarde</b> o <b>Retiro</b>, desde la computadora o desde la app del celular. Las inasistencias se pueden justificar, con una nota. Cada estado cuenta según lo que defina el colegio (por ejemplo, tarde = media falta).'),
          box('<b>Sin señal también.</b> En la app, si no hay conexión al tomar lista, la asistencia queda guardada en el celular y se envía sola cuando vuelve la señal. Al guardar, la app pasa sola al próximo curso pendiente.'),
          shot('d_asistencia', 'Toma de asistencia.'),
          P('Alertas automáticas', 'h2'),
          P('Las reglas las define el colegio, sin tocar nada técnico: total de faltas, días consecutivos, porcentaje de asistencia o faltas en los últimos días. Cuando un alumno cumple una regla, aparece en el panel de alertas y se avisa a preceptoría y a la conducción (y, si se configura, a la familia). Cada alerta se atiende y se resuelve con un comentario.'),
          shot('d_alertas', 'Panel de alertas de asistencia.'),
          CondPageBreak(9 * cm)]

# ---------------- 11 ----------------
story += [P('11. Estadísticas por curso', 'h1'),
          P('Para la conducción, coordinación, preceptoría y secretaría: una tabla con todos los cursos de su alcance y, para cada uno, asistencia, inasistencias, llegadas tarde, retiros, promedio y alertas activas. Al tocar un curso se ven los <b>gráficos por mes</b> (presentes, ausentes, tarde y retiros), los alumnos con más faltas y el <b>promedio por materia y por período</b> (en Primario, cuántos alumnos hay en cada valoración; en Inicial no hay promedios).'),
          shot('d_estadisticas', 'Estadísticas por curso vistas por la Rectoría de Secundario.'),
          CondPageBreak(9 * cm)]

# ---------------- 12 ----------------
story += [P('12. Ficha del alumno', 'h1'),
          P('Desde <b>Alumnos</b> se busca a cualquier alumno por nombre o DNI (o desde el buscador de arriba). Su ficha reúne el boletín (con el selector de ciclo), la asistencia, sus datos, su <b>trayectoria</b> (año por año, en qué curso estuvo) y su familia. Desde ahí, quien tiene permiso puede:'),
          bullets([
              'Agregar o desvincular familiares y blanquear contraseñas.',
              'Crear la cuenta propia del estudiante (Secundario).',
              '<b>Cambiar de curso</b> dentro del mismo año, sin perder notas ni asistencia.',
              '<b>Dar de baja</b> con motivo (cambio de colegio, egreso, mudanza, etc.) y fecha. No se borra nada: el historial queda guardado y se puede <b>reincorporar</b>.',
          ]),
          shot('d_alumno', 'Ficha de una alumna de Secundario.'),
          P('Cargar alumnos', 'h2'),
          P('Dirección, Rectoría, Vicedirección, Secretaría y Administración cargan alumnos, cada una en su alcance, desde el botón <b>Agregar alumno</b> de la pantalla Alumnos (uno por uno, con hasta seis familiares, o importando una planilla de Excel). Las cuentas nuevas reciben su acceso por mail; además, la hoja de credenciales tiene el botón <b>Probar ingreso</b>, que abre el login con los datos ya cargados para verificar el acceso en el momento.'),
          shot('d_alumnos', 'Alumnos: búsqueda, filtros por división y el botón Agregar alumno.'),
          CondPageBreak(9 * cm)]

# ---------------- 13 ----------------
story += [P('13. Administración del colegio', 'h1'),
          P('La sección <b>Administración</b> concentra la configuración. Cada pestaña aparece según los permisos de quien entra: la Rectoría de Secundario, por ejemplo, ve <i>Calificaciones</i>, <i>Personal</i> y <i>Alumnos y familias</i> de su nivel.'),
          table([
              ['Pestaña', 'Para qué sirve'],
              ['Institución', 'Nombre, datos y escudo del colegio (aparece en la pantalla de ingreso).'],
              ['Estructura', 'Niveles, cursos y materias, y qué docente dicta cada materia. Para un colegio nuevo, crea en un paso las salas, los grados y los años.'],
              ['Calificaciones', 'Cómo se califica en cada nivel: modo por defecto, escala, rangos, valor de las inasistencias, períodos (trimestral o bimestral, con fechas) y nota de cuatrimestre. La configura la conducción de cada nivel.'],
              ['Ciclo lectivo', 'Prepara el año siguiente copiando los cursos y hace la <b>promoción anual</b>: sugiere el curso de destino de cada alumno (promueve, repite o egresa) y pasa al ciclo nuevo en un solo paso, conservando los boletines anteriores.'],
              ['Personal', 'Alta de directivos, docentes y preceptores, una por una o <b>por planilla</b>. A cada persona se le pueden sumar <b>otros roles</b>. Las cuentas nuevas reciben su acceso por mail con el botón para entrar directo.'],
              ['Alumnos y familias', 'Alta de alumnos con sus familiares, una por una o por planilla. Los hermanos se vinculan solos a la misma familia.'],
              ['Roles y permisos', 'Qué puede hacer cada rol y los <b>roles personalizados</b> del colegio.'],
              ['Auditoría', 'Registro de quién hizo cada cambio, cuándo y desde qué IP, y de los ingresos a la cuenta (también los fallidos).'],
          ], [0.22, 0.78]),
          shot('d_estructura', 'Estructura: creación por defecto y cursos por nivel.'),
          shot('d_personal', 'Personal: alta individual, importación por planilla y "Otro rol" por persona.'),
          shot('d_ciclo', 'Ciclo lectivo: preparar el año siguiente y aplicar la promoción.'),
          shot('d_auditoria', 'Auditoría: cambios e ingresos con usuario, fecha e IP.'),
          CondPageBreak(9 * cm)]

# ---------------- 14 ----------------
story += [P('14. Archivos', 'h1'),
          P('Los materiales de las aulas y los adjuntos de comunicados y mensajes se guardan en un almacenamiento seguro. En <b>Archivos</b>, cada persona ve lo que subió y cuánto espacio usa; la administración ve el uso total y por persona, y puede liberar espacio.'),
          bullets([
              'En el plan Básico, cada persona tiene <b>5 GB</b> para sus archivos.',
              'Las fotos se comprimen solas en el celular antes de subirse.',
              'Para videos largos conviene subirlos a YouTube como "no listado" y pegar el link: se ven dentro del aula sin ocupar espacio.',
          ]),
          ]

# ---------------- 15 ----------------
story += [CondPageBreak(10 * cm), P('15. Facturación y planes', 'h1'),
          P('Facturación', 'h2'),
          P('Se cobra por <b>persona con acceso</b> al colegio (personal, familias y estudiantes con cuenta), por mes calendario. Quien tuvo acceso al menos un día del mes se cobra ese mes completo; si se desactiva, deja de cobrarse desde el mes siguiente. La pantalla de <b>Facturación</b> (solo para la Representante Legal) muestra el total del mes, el detalle persona por persona y se puede exportar a Excel.'),
          shot('d_facturacion', 'Facturación del Colegio Demo.'),
          P('Planes', 'h2'),
          P('Este colegio de demostración está en el <b>plan Básico</b>, que incluye todo lo que se describe en este manual salvo lo indicado. Hay planes superiores con funciones adicionales, que se asignan <b>por persona</b> (por ejemplo, solo a la conducción o a algunos docentes):'),
          table([
              ['Plan', 'Por persona / mes', 'Espacio', 'Qué agrega'],
              ['Básico', '$660', '5 GB', 'Comunicados, mensajes, canales, aulas con TP y evaluaciones, notas, boletines, asistencia, alertas, estadísticas, buscador y administración.'],
              ['Ampliado', '$720', '15 GB', 'Más espacio para archivos.'],
              ['Profesional', '$2.150', '30 GB', 'Recibos de sueldo digitales con conformidad y legajo docente (cargos, horas, turnos y horario).'],
              ['Integral', '$3.000', '50 GB', 'Calendario de actos con feriados nacionales y encargados, programas de las materias por unidades y juegos de preguntas en el aula.'],
          ], [0.15, 0.17, 0.11, 0.57]),
          P('Las funciones de los planes superiores aparecen en el menú con un candado: al tocarlas, Sentryx explica qué incluyen y permite pedir el cambio de plan. La Representante Legal aprueba o rechaza esos pedidos desde <b>Planes</b>. Si alguien cambia de plan durante el mes, se cobra el plan más alto que tuvo ese mes.'),
          phones([('p_candado', 'Una función de un plan superior, vista desde el plan Básico.'), ('p_boletin', 'Boletín publicado, visto por la familia en el celular.')]),
          shot('d_planes', 'Planes: cantidad de personas por plan y total mensual.'),
          CondPageBreak(9 * cm)]

# ---------------- 16 ----------------
story += [P('16. Seguridad y privacidad', 'h1'),
          bullets([
              '<b>Cada persona ve solo lo suyo.</b> Una familia ve únicamente a sus hijos; un docente, sus cursos y materias, y no ve los datos de contacto de las familias.',
              '<b>Contraseñas protegidas:</b> se guardan cifradas, se cambian en el primer ingreso y se recuperan por email. Los intentos fallidos repetidos se bloquean. El link del mail de bienvenida lleva los datos de forma que nunca pasan por el servidor.',
              '<b>Conexión segura (HTTPS)</b> y acceso solo desde la aplicación oficial de Sentryx (web y app).',
              '<b>Nada se borra:</b> las bajas de alumnos y personal conservan el historial (notas, asistencia y mensajes); los comunicados se archivan, no se eliminan.',
              '<b>Auditoría:</b> los cambios importantes y los ingresos quedan registrados con usuario, fecha, hora e IP.',
              '<b>Copias de seguridad diarias</b> de la base de datos, guardadas aparte.',
              '<b>Datos de menores:</b> los estudiantes de Inicial y Primario no tienen cuenta; en Secundario la cuenta es opcional y la crea la escuela.',
          ]),
          P('17. Soporte', 'h1'),
          P('Desde el menú (o desde <b>Mi perfil</b>) cualquier persona puede tocar <b>Reportar un problema</b>, contar qué pasó y <b>adjuntar capturas de pantalla o un video corto</b> de lo que ve. El reporte llega al equipo de Sentryx con la pantalla en la que estaba y el detalle técnico necesario. La respuesta le llega como notificación y la ve en <i>Mis reportes</i>.'),
          CondPageBreak(9 * cm)]

# ---------------- 18 ----------------
story += [P('18. Novedades de esta edición', 'h1'),
          P('Respecto del manual anterior (octubre de 2026, primera edición):'),
          bullets([
              '<b>App para iPhone y Android</b>, liviana y con asistencia sin señal (sección 2).',
              'El mail de bienvenida entra directo, sin copiar usuario ni contraseña (sección 2).',
              '<b>Roles:</b> Coordinación pedagógica y Jefatura de preceptores; <b>roles personalizados</b> creados por la conducción; <b>varios roles por persona</b> con permisos sumados; los docentes toman asistencia de sus cursos; Secretaría ya no publica boletines (sección 4).',
              '<b>Buscador</b> en la barra superior y página de <b>Ayuda</b> (sección 5).',
              '<b>Comunicados:</b> borradores, envíos programados, archivo, buscador y filtros, y envío a <b>familias elegidas una por una</b> con filtros por nivel, grado y división (sección 6).',
              '<b>Aulas:</b> trabajos prácticos y evaluaciones con fecha, agenda del curso y "Próximas evaluaciones" en el inicio (sección 8).',
              '<b>Calificaciones:</b> modo por nivel (números, letras, informes o mixto) definido por la conducción del nivel y ajustable por período; <b>nota de cuatrimestre</b>; boletines de <b>años anteriores</b> y trayectoria del alumno; publicar boletines es solo de la conducción (sección 9).',
              '<b>Estadísticas por curso</b> con gráficos de asistencia y promedios (sección 11).',
              '<b>Cargar alumnos</b> desde la pantalla Alumnos para toda la conducción, cada una en su alcance, y botón <b>Probar ingreso</b> en las credenciales (sección 12).',
              'Reportes de problemas con <b>capturas y videos</b> (sección 17).',
          ]),
          CondPageBreak(9 * cm)]

# ---------------- 19 ----------------
story += [P('19. Recorrido sugerido para evaluar Sentryx', 'h1'),
          P('Unos 25 minutos, idealmente con dos dispositivos (una computadora para la escuela y un celular para la familia), para ver una situación real de punta a punta.'),
          P('A. Comunicar (Rectoría → familias)', 'h3'),
          steps([
              'En la computadora, ingresá como <b>rectora</b>. Mirá el Inicio, las alertas y <b>Estadísticas</b>.',
              'Andá a <b>Comunicados → Nuevo</b>, elegí el curso <b>5º 1ª</b>, marcá <i>Pedir confirmación</i> y enviá. Probá también <i>Guardar como borrador</i> y <i>Programar el envío</i>.',
              'En el celular, ingresá como <b>familia25</b>: llega el comunicado; confirmalo. Probá el buscador y los filtros de la bandeja.',
              'Volvé a la computadora: en el comunicado vas a ver que esa familia ya leyó y confirmó.',
          ]),
          P('B. Familia ↔ escuela y aula', 'h3'),
          steps([
              'Como <b>familia25</b>, abrí <b>Mensajes</b>: está la conversación con preceptoría por una inasistencia. Respondé algo.',
              'Ingresá como <b>preceptora</b>: le aparece el mensaje nuevo. Desde Asistencia, justificá la falta.',
              'Como <b>docente3</b>, en el aula de 2º 1ª publicá una <b>evaluación</b> con fecha: aparece en la agenda y en el inicio de la familia.',
          ]),
          P('C. Notas y boletín', 'h3'),
          steps([
              'Como <b>rectora</b>, en <b>Administración → Calificaciones</b> mirá el modo de Secundario y agregá la <b>nota de cuatrimestre</b>.',
              'Ingresá como <b>docente3</b>, entrá a <b>Materias</b> y cargá notas con la carga rápida.',
              'Como <b>rectora</b>, publicá el boletín de ese período para el curso. Como familia, abrí <b>Mi hijo/a</b>: el boletín ya está visible.',
          ]),
          P('D. Gestión (Representante Legal)', 'h3'),
          steps([
              'Ingresá como <b>representante</b>. En <b>Administración</b> recorré Estructura, Personal (sumale <i>Otro rol</i> a alguien) y Roles y permisos (creá un rol personalizado).',
              'En <b>Alumnos</b>, tocá <b>Agregar alumno</b> y probá <i>Probar ingreso</i> en las credenciales.',
              'Escribí "faltas" o "boletín" en el buscador de arriba. Revisá <b>Auditoría</b> y <b>Facturación</b>.',
          ]),
          box('El colegio de demostración es solo para probar: lo que hagan no afecta a ningún colegio real y se puede reiniciar cuando quieran.'),
          CondPageBreak(9 * cm)]

# ---------------- 20 ----------------
story += [P('20. Preguntas frecuentes', 'h1')]
faq = [
    ('¿Hay que instalar algo?', 'No es obligatorio: funciona desde el navegador. En el celular conviene instalar la app Sentryx (o "agregar a la pantalla de inicio") para usarla como app y recibir notificaciones.'),
    ('¿Qué pasa si una familia no tiene smartphone?', 'Puede ingresar desde cualquier computadora. Los comunicados urgentes o que piden confirmación también le llegan por email.'),
    ('¿Cómo se cargan los datos del colegio?', 'La estructura se crea en un paso y el personal, los alumnos y las familias se pueden importar desde planillas de Excel. El equipo de SRV acompaña la carga inicial.'),
    ('¿Una persona con dos roles necesita dos cuentas?', 'No. Una secretaria que además es preceptora, o una directora que también da clases, usa una sola cuenta y tiene los permisos de ambos roles sumados.'),
    ('¿Quién decide cómo se califica?', 'La conducción de cada nivel, desde Administración → Calificaciones: solo números, solo letras, informes o mixto, y después período por período.'),
    ('¿Se pierden las notas al pasar de grado?', 'No. Los boletines de años anteriores quedan en la ficha del alumno, con un selector de ciclo.'),
    ('¿Las familias pueden escribirse entre ellas?', 'No. Los mensajes son siempre entre la familia y el personal de la escuela, sobre un alumno.'),
    ('¿Qué pasa con la información de un alumno que se va?', 'Se lo da de baja con un motivo y su historial queda guardado. Si vuelve, se lo reincorpora.'),
    ('¿Se puede empezar con el plan Básico y ampliar después?', 'Sí. Los planes se cambian por persona en cualquier momento.'),
    ('¿A quién consulto si algo no funciona?', 'Desde la app, con "Reportar un problema" (se pueden adjuntar capturas o un video). Llega directamente al equipo de Sentryx.'),
]
for q, a in faq:
    story += [KeepTogether([P(q, 'h3'), P(a)])]
story += [Spacer(1, 18), box('<b>Sentryx</b> es una plataforma de <b>SRV</b> · wearesrv.com')]

doc.build(story)
print('PDF generado:', OUT)
