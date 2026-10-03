import type { ToolKind } from '../core/workspace'
import type { BrowserData } from '../workspace/surfaces/BrowserSurface'
import type { CodeData } from '../workspace/surfaces/CodeSurface'
import type { DocumentData } from '../workspace/surfaces/DocumentSurface'
import type { FilesData } from '../workspace/surfaces/FilesSurface'
import type { TasksData } from '../workspace/surfaces/TasksSurface'
import type { CalendarData, MemoryData, ResearchData, SearchData } from '../workspace/surfaces/InfoSurfaces'
import type { ImagesData, MediaData, PreviewData, VideoData } from '../workspace/surfaces/MediaSurfaces'

/**
 * DEMO ONLY: what each tool shows when it is opened from the dock, so the
 * surfaces can be judged in a realistic working state. The runtime supplies
 * real content through `workspace.open(kind, title, data)`.
 */

const FLAM = 'https://www.visitnorway.com/places-to-go/fjord-norway/the-sognefjord/flam-railway'

const browser: BrowserData = {
  query: 'Flåm Railway timetable',
  results: [
    {
      title: 'The Flåm Railway · Fjord Norway',
      url: FLAM,
      snippet: 'One of the steepest standard-gauge railways in the world, from the mountain station at Myrdal down to Flåm at the end of the Aurlandsfjord.',
    },
    {
      title: 'Bergen Line: Oslo – Myrdal – Bergen',
      url: 'https://www.vy.no/en/travel-with-us/bergen-line',
      snippet: 'Daily departures across the Hardangervidda plateau. Change at Myrdal for the Flåm Railway.',
    },
    {
      title: 'Norway in a Nutshell · day tour',
      url: 'https://www.norwaynutshell.com/',
      snippet: 'Train, fjord cruise and bus in one day: the Bergen Line, the Flåm Railway and the Nærøyfjord.',
    },
  ],
  pages: {
    [FLAM]: {
      site: 'visitnorway.com',
      title: 'The Flåm Railway',
      blocks: [
        { p: 'The railway climbs 863 metres over 20 kilometres between Flåm, at sea level on the Aurlandsfjord, and Myrdal on the Bergen Line. The journey takes about an hour each way.' },
        { h: 'On the way' },
        { list: ['Kjosfossen waterfall, where the train stops so you can step out', 'Twenty tunnels, most of them dug by hand', 'Views down the Flåm valley and its farms'] },
        { h: 'Planning' },
        { p: 'Trains run all year, most often in summer. Seats on the left going down give the best views of the valley. Book ahead in July and August.' },
      ],
    },
  },
}

const files: FilesData = {
  root: {
    name: 'Home',
    kind: 'folder',
    children: [
      {
        name: 'Documents',
        kind: 'folder',
        children: [
          {
            name: 'Trips',
            kind: 'folder',
            children: [
              {
                name: 'Norway 2026',
                kind: 'folder',
                children: [
                  { name: 'itinerary.md', kind: 'doc', size: '4 KB', modified: 'Today 16:42' },
                  { name: 'bergen-line-tickets.pdf', kind: 'pdf', size: '212 KB', modified: 'Today 16:40' },
                  { name: 'budget.xlsx', kind: 'sheet', size: '18 KB', modified: 'Yesterday' },
                  { name: 'route.ts', kind: 'code', size: '2 KB', modified: 'Today 16:41' },
                  { name: 'reine-at-dusk.jpg', kind: 'image', size: '3.1 MB', modified: 'Sep 12' },
                  {
                    name: 'Photos',
                    kind: 'folder',
                    children: [
                      { name: 'flam-valley.jpg', kind: 'image', size: '2.8 MB', modified: 'Sep 12' },
                      { name: 'geiranger.jpg', kind: 'image', size: '3.4 MB', modified: 'Sep 12' },
                    ],
                  },
                ],
              },
              { name: 'Lisbon 2025', kind: 'folder', children: [{ name: 'notes.md', kind: 'doc', size: '2 KB', modified: 'Mar 3' }] },
            ],
          },
          { name: 'Taxes', kind: 'folder', children: [] },
        ],
      },
      { name: 'Downloads', kind: 'folder', children: [{ name: 'ferry-schedule.pdf', kind: 'pdf', size: '96 KB', modified: 'Today 16:38' }] },
    ],
  },
  path: ['Documents', 'Trips', 'Norway 2026'],
  selected: 'bergen-line-tickets.pdf',
}

const code: CodeData = {
  file: 'route.ts',
  code: [
    "import { stops, type Leg } from './stops'",
    '',
    '// Seven days, south to north: rail where it is scenic, ferries on the fjords.',
    'export const route: Leg[] = [',
    "  { from: 'Oslo', to: 'Myrdal', by: 'train', depart: '08:25' },",
    "  { from: 'Myrdal', to: 'Flåm', by: 'train', depart: '13:20' },",
    "  { from: 'Flåm', to: 'Gudvangen', by: 'ferry', depart: '09:00' },",
    "  { from: 'Bergen', to: 'Geiranger', by: 'road' },",
    "  { from: 'Ålesund', to: 'Trondheim', by: 'road' },",
    "  { from: 'Bodø', to: 'Lofoten', by: 'ferry', depart: '15:30' },",
    ']',
    '',
    'export const totalKm = route.reduce((km, leg) => km + stops.distance(leg), 0)',
  ].join('\n'),
  changed: [9, 10],
}

const documents: DocumentData = {
  title: 'Norway trip · plan',
  meta: 'Draft · PEPO wrote the first version today',
  blocks: [
    { p: 'Seven days from Oslo to Lofoten, mostly by train and ferry, with two days on the road through the fjords.' },
    { h: 'What to book first' },
    { list: ['Bergen Line seats, Oslo to Myrdal (day 2)', 'Nærøyfjord ferry, Flåm to Gudvangen (day 3)', 'Flight from Ålesund or Trondheim to Bodø (day 7)'] },
    { h: 'Open questions' },
    { p: 'Whether to drive Strynefjellet in one day or stay a night in Loen. The weather in late September decides it.' },
  ],
}

const tasks: TasksData = {
  title: 'Norway trip',
  tasks: [
    { id: 't1', text: 'Book Bergen Line seats', done: true },
    { id: 't2', text: 'Reserve the Nærøyfjord ferry', done: false, doing: true, byPepo: true },
    { id: 't3', text: 'Two nights in Bergen', done: false, due: 'by Friday' },
    { id: 't4', text: 'Rental car, Bergen to Ålesund', done: false, byPepo: true },
    { id: 't5', text: 'Flight to Bodø', done: false },
    { id: 't6', text: 'Check the forecast for Strynefjellet', done: false, byPepo: true },
  ],
}

/** The trip scenario: PEPO compares places in the browser while it plans. */
export const TRIP_BROWSER: BrowserData = {
  query: 'Bergen vs Ålesund vs Lofoten in late September',
  results: [
    {
      title: 'Bergen · the gateway to the fjords',
      url: 'https://en.visitbergen.com/',
      snippet: 'Rail from Oslo, boats to the Sognefjord and Hardangerfjord. Wettest of the three: plan an indoor day.',
    },
    {
      title: 'Ålesund · Art Nouveau town by the sea',
      url: 'https://www.visitalesund.com/',
      snippet: 'An hour from the Geirangerfjord. Quieter than Bergen in autumn, with the best viewpoint at Aksla.',
    },
    {
      title: 'Lofoten · late season',
      url: 'https://www.lofoten.info/',
      snippet: 'Fewer visitors, first northern lights, shorter days. A car or local buses between Reine and Svolvær.',
    },
  ],
}

const images: ImagesData = {
  items: [
    { title: 'Reine at dusk', meta: 'Lofoten · Sep 12', seed: 21, mood: 'dusk' },
    { title: 'Flåm valley', meta: 'Sep 12', seed: 7, mood: 'day' },
    { title: 'Geirangerfjord', meta: 'Sep 12', seed: 13, mood: 'dawn' },
    { title: 'Northern lights over Hamnøy', meta: 'Sep 13', seed: 31, mood: 'night' },
    { title: 'Nærøyfjord from the ferry', meta: 'Sep 11', seed: 3, mood: 'day' },
    { title: 'Ålesund from Aksla', meta: 'Sep 10', seed: 17, mood: 'dawn' },
  ],
}

const video: VideoData = {
  title: 'The Flåm Railway, Myrdal to Flåm · 2:14',
  duration: 134,
  seed: 7,
  mood: 'day',
  captions: [
    [0, 'Leaving Myrdal, 866 metres above the fjord.'],
    [22, 'The train stops at Kjosfossen.'],
    [61, 'Down through twenty tunnels.'],
    [104, 'Arriving in Flåm, at sea level.'],
  ],
}

const media: MediaData = {
  queue: [
    { title: 'Fjord Morning', artist: 'Ambient · for focus', duration: 214 },
    { title: 'Northern Light', artist: 'Ambient · for focus', duration: 248 },
    { title: 'Slow Ferry', artist: 'Ambient · for focus', duration: 191 },
  ],
}

const preview: PreviewData = {
  file: 'bergen-line-tickets.pdf',
  kind: 'ticket',
  fields: [
    ['From', 'Oslo S'],
    ['To', 'Myrdal'],
    ['Date', 'Day 2 · 08:25'],
    ['Car · Seat', '4 · 52, 53 (window)'],
    ['Passengers', '2 adults'],
    ['Change', 'Myrdal → Flåm 13:20'],
  ],
  note: 'Show this on your phone. Seats are on the left, for the valley views.',
}

const calendar: CalendarData = {
  week: 'Norway trip · day 1–7',
  days: ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7'],
  events: [
    { day: 0, start: 15, end: 18, title: 'Oslo · Opera, Bygdøy' },
    { day: 1, start: 8.4, end: 13, title: 'Bergen Line to Myrdal' },
    { day: 1, start: 13.3, end: 14.3, title: 'Flåm Railway' },
    { day: 2, start: 9, end: 11, title: 'Nærøyfjord ferry', tentative: true },
    { day: 3, start: 10, end: 16, title: 'Bergen · Bryggen, Fløyen' },
    { day: 4, start: 8, end: 15, title: 'Drive to Geiranger', tentative: true },
    { day: 5, start: 11, end: 18, title: 'Ålesund' },
    { day: 6, start: 9, end: 12, title: 'Flight to Bodø', tentative: true },
    { day: 6, start: 15.5, end: 19, title: 'Ferry to Lofoten' },
  ],
}

const research: ResearchData = {
  question: 'Is late September a good time for the fjords and Lofoten?',
  findings: [
    { text: 'Fewer visitors and lower prices after mid-September; most boats and trains still run on summer timetables until October.', refs: [1, 2] },
    { text: 'Bergen is the wettest stop; Geiranger and Ålesund are usually drier. Plan one flexible indoor day.', refs: [3] },
    { text: 'Darker evenings in Lofoten make the first northern lights likely on clear nights.', refs: [4] },
  ],
  sources: [
    { title: 'Seasons in Fjord Norway', site: 'visitnorway.com' },
    { title: 'Timetables · Bergen Line and Flåm Railway', site: 'vy.no' },
    { title: 'Climate normals, western Norway', site: 'met.no' },
    { title: 'Northern lights in Lofoten', site: 'lofoten.info' },
  ],
}

const search: SearchData = {
  query: 'bergen',
  index: [
    { group: 'Files', title: 'bergen-line-tickets.pdf', detail: 'Documents › Trips › Norway 2026' },
    { group: 'Files', title: 'itinerary.md', detail: 'Day 4 — Bergen · Bryggen, Fløyen, fish market' },
    { group: 'Notes', title: 'Two nights in Bergen', detail: 'Tasks · by Friday' },
    { group: 'Notes', title: 'Bergen Line seats on the left', detail: 'Norway trip · plan' },
    { group: 'Calendar', title: 'Bergen · Bryggen, Fløyen', detail: 'Day 4 · 10:00–16:00' },
  ],
}

const memory: MemoryData = {
  facts: [
    { id: 'm1', text: 'Prefers trains and ferries over flights when there is time.', learned: 'Learned today' },
    { id: 'm2', text: 'Likes window seats on scenic routes.', learned: 'Learned today' },
    { id: 'm3', text: 'Travels with one other adult.', learned: 'Sep 12' },
    { id: 'm4', text: 'Works best with calm, ambient music.', learned: 'Sep 3' },
  ],
}

export const SAMPLE: Partial<Record<ToolKind, Record<string, unknown>>> = {
  images: { ...images },
  video: { ...video },
  media: { ...media },
  preview: { ...preview },
  calendar: { ...calendar },
  research: { ...research },
  search: { ...search },
  memory: { ...memory },
  browser: { ...browser },
  files: { ...files },
  code: { ...code },
  documents: { ...documents },
  tasks: { ...tasks },
}
