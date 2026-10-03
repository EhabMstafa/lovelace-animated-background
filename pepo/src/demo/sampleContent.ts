import type { ToolKind } from '../core/workspace'
import type { BrowserData } from '../workspace/surfaces/BrowserSurface'
import type { CodeData } from '../workspace/surfaces/CodeSurface'
import type { DocumentData } from '../workspace/surfaces/DocumentSurface'
import type { FilesData } from '../workspace/surfaces/FilesSurface'
import type { TasksData } from '../workspace/surfaces/TasksSurface'

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

export const SAMPLE: Partial<Record<ToolKind, Record<string, unknown>>> = {
  browser: { ...browser },
  files: { ...files },
  code: { ...code },
  documents: { ...documents },
  tasks: { ...tasks },
}
