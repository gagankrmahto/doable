// Built-in event calendars shown on Doable's calendar views.
// Each set has: annual (month-day, every year), dated (one-off), and derive (copied from the
// Indian festivals feed by title, so lunar dates stay correct every year without manual updates).
window.DOABLE_EVENT_SETS = {
  festivals: {
    name: 'Indian festivals',
    short: 'Festivals',
    emoji: '🪔',
    color: '#d4a017',
    source: 'Google public calendar: Holidays in India',
  },

  aol: {
    name: 'Art of Living',
    short: 'Art of Living',
    emoji: '🧘',
    color: '#f76b15',
    source: 'artofliving.org and panchang dates',
    annual: [
      { md: '05-13', t: "Gurudev Sri Sri Ravi Shankar's Birthday", note: 'Celebrated by Art of Living centres worldwide with satsang, meditation and seva.' },
      { md: '06-21', t: 'International Day of Yoga', note: 'Yoga sessions are held at Art of Living centres and in public spaces.' },
      { md: '12-21', t: 'World Meditation Day', note: 'UN-declared day; Gurudev usually leads a global guided meditation.' },
    ],
    dated: [
      { d: '2026-07-29', t: 'Guru Purnima', note: 'Ashadha full moon: day of gratitude to the Guru. Satsang and Guru Puja.' },
      { d: '2027-07-18', t: 'Guru Purnima', note: 'Ashadha full moon: day of gratitude to the Guru. Satsang and Guru Puja.' },
      // Navratri 2026 at the Art of Living International Center, Bengaluru (artofliving.org/in-en/navratri). Timings subject to change.
      { d: '2026-10-10', t: 'Navratri: Rudrabhishekam', time: '09:00', note: 'Art of Living International Center, Bengaluru.' },
      { d: '2026-10-11', t: 'Navratri: Rudrabhishekam', time: '19:00', note: 'Daily at 7 pm, Oct 11–15. Bengaluru ashram.' },
      { d: '2026-10-12', t: 'Navratri: Rudrabhishekam', time: '19:00' },
      { d: '2026-10-13', t: 'Navratri: Rudrabhishekam', time: '19:00' },
      { d: '2026-10-14', t: 'Navratri: Rudrabhishekam', time: '19:00' },
      { d: '2026-10-15', t: 'Navratri: Rudrabhishekam', time: '19:00' },
      { d: '2026-10-16', t: 'Navratri: Ganapathy, Subramanya & Navagraha Homa', time: '07:00', note: 'Chandi Homa begins at 4:30 pm.' },
      { d: '2026-10-17', t: 'Navratri: Maha Rudra Homa', time: '07:00', note: 'Sudarshan Homa and Vishnu Sahasranama Parayanam at 4:30 pm.' },
      { d: '2026-10-18', t: 'Navratri: Shat Chandi Homa', time: '07:00' },
      { d: '2026-10-19', t: 'Navratri: Rishi Homa', time: '07:00' },
      { d: '2026-10-20', t: 'Vijayadashami Pooja', time: '07:00', note: 'Navratri concludes. Bengaluru ashram.' },
      { d: '2026-10-23', t: 'Sanyam Level 2 (post-Navratri)', note: 'Oct 23–26, Bengaluru ashram.' },
    ],
    // Festivals highlighted as sacred days in the Art of Living view
    sacred: /^(Maha Shivaratri|First Day of Sharad Navratri|Maha (Saptami|Ashtami)|Dussehra|Diwali|Janmashtami|Ganesh Chaturthi|Rama Navami|Buddha Purnima|Vasant Panchami|Makar Sankranti|Holi|Raksha Bandhan|Gudi Padwa|Ugadi|Govardhan Puja|Guru Nanak Jayanti|Mahavir Jayanti|Maharishi Valmiki Jayanti)$/,
    derive: [
      { match: /^Maha Shivaratri$/, t: 'Maha Shivaratri: Rudra Puja & meditation', note: 'Night of meditation, chanting and Rudra Puja.' },
      { match: /^First Day of Sharad Navratri$/, t: 'Navratri begins', note: 'Nine nights of homas, satsang and celebration.' },
      { match: /^Dussehra$/, t: 'Vijayadashami: Navratri concludes', skipIfDated: true },
      { match: /^(Gudi Padwa|Ugadi)$/, t: 'Chaitra Navratri begins' },
    ],
  },

  // Birthdays & anniversaries of your people (managed in the app; shown with the Personal space)
  birthdays: {
    name: 'Birthdays & anniversaries',
    short: 'Birthdays',
    emoji: '🎂',
    color: '#d6409f',
    fromPeople: true,
  },

  // Purnima, Amavasya, Ekadashi, Pradosh & Masik Shivaratri, computed for your location (web/panchang.js).
  // Shown with the Art of Living space.
  moon: {
    name: 'Moon & vrat days',
    short: 'Moon days',
    emoji: '🌕',
    color: '#8b7bd8',
    source: 'Computed from Moon/Sun positions; days follow the tithi at local sunrise',
    moonPhases: true,
    full: { t: 'Purnima · Full moon', note: 'Full moon at {time}. A powerful day for meditation, satsang and Sudarshan Kriya.' },
    new: { t: 'Amavasya · New moon', note: 'New moon at {time}. A quiet, inward day, good for silence and deep meditation.' },
    special: {
      ekadashi: { emoji: '🪷', t: '{paksha} Ekadashi', note: 'Fasting and meditation day. Ekadashi tithi until {until}.' },
      pradosh: { emoji: '🌆', t: 'Pradosh Vrat', note: 'Trayodashi at dusk: Shiva puja and meditation after sunset ({sunset}).' },
      shivaratri: { emoji: '🔱', t: 'Masik Shivaratri', note: 'Monthly night of Shiva: meditation and chanting around midnight.' },
    },
    // Festivals that fall on the same day name the Purnima / Amavasya
    names: [
      { type: 'full', match: /^Buddha Purnima$/, t: 'Buddha Purnima · Vaishakha full moon' },
      { type: 'full', match: /^Raksha Bandhan$/, t: 'Shravana Purnima · Raksha Bandhan' },
      { type: 'full', match: /^Maharishi Valmiki Jayanti$/, t: 'Sharad Purnima · Valmiki Jayanti' },
      { type: 'full', match: /^Guru Nanak Jayanti$/, t: 'Kartik Purnima · Dev Deepawali' },
      { type: 'full', match: /^Holi(ka Dahana)?$/, t: 'Phalguna Purnima · Holi' },
      { type: 'new', match: /^First Day of Sharad Navratri$/, offset: 1, t: 'Mahalaya Amavasya', note: 'Pitru Paksha ends; Navratri begins the next day.' },
    ],
  },

  ngo: {
    name: 'NGO planning days',
    short: 'NGO days',
    emoji: '🤝',
    color: '#12a594',
    source: 'UN international days and Indian national observances',
    annual: [
      { md: '01-12', t: 'National Youth Day', note: 'Swami Vivekananda Jayanti: youth volunteering drives.' },
      { md: '01-24', t: 'National Girl Child Day' },
      { md: '02-20', t: 'World Day of Social Justice' },
      { md: '03-08', t: "International Women's Day", note: 'Women-empowerment events and campaigns.' },
      { md: '03-22', t: 'World Water Day' },
      { md: '04-01', t: 'New financial year: plan CSR proposals', note: 'Indian companies set CSR budgets for the year; a good time to pitch programmes.' },
      { md: '04-07', t: 'World Health Day', note: 'Health camps and awareness sessions.' },
      { md: '04-22', t: 'Earth Day' },
      { md: '05-01', t: 'International Labour Day' },
      { md: '05-31', t: 'Due: Form 10BD donation statement (80G)', kind: 'deadline', note: 'Annual statement of donations received. Confirm the current due date with your CA.' },
      { md: '06-05', t: 'World Environment Day', note: 'Tree plantation and clean-up drives.' },
      { md: '06-12', t: 'World Day Against Child Labour' },
      { md: '06-21', t: 'International Day of Yoga' },
      { md: '07-11', t: 'World Population Day' },
      { md: '07-15', t: 'World Youth Skills Day', note: 'Skilling and vocational-training showcases.' },
      { md: '08-12', t: 'International Youth Day' },
      { md: '08-19', t: 'World Humanitarian Day' },
      { md: '09-05', t: "Teachers' Day · International Day of Charity" },
      { md: '09-08', t: 'International Literacy Day', note: 'Education and remedial-learning programmes.' },
      { md: '10-02', t: 'Daan Utsav begins (Joy of Giving Week)', note: "India's festival of giving, Oct 2–8. Plan donation and volunteering drives." },
      { md: '10-11', t: 'International Day of the Girl Child' },
      { md: '10-17', t: 'International Day for the Eradication of Poverty' },
      { md: '11-14', t: "Children's Day", note: "Children's activities, events and fundraisers." },
      { md: '11-20', t: "World Children's Day" },
      { md: '11-25', t: 'Day for the Elimination of Violence against Women', note: 'Starts 16 Days of Activism (to Dec 10).' },
      { md: '12-03', t: 'International Day of Persons with Disabilities' },
      { md: '12-05', t: 'International Volunteer Day', note: 'Thank and recognise your volunteers.' },
      { md: '12-10', t: 'Human Rights Day' },
      { md: '12-31', t: 'Due: FCRA annual return (FC-4)', kind: 'deadline', note: 'For NGOs registered under FCRA. Confirm the current due date with your CA.' },
    ],
    rules: [
      // GivingTuesday: the Tuesday after the fourth Thursday of November
      { t: 'GivingTuesday', note: 'Global day of giving: run an online fundraising campaign.', date: y => { const d = new Date(y, 10, 1); const firstThu = 1 + ((4 - d.getDay() + 7) % 7); return new Date(y, 10, firstThu + 21 + 5); } },
    ],
  },
};
