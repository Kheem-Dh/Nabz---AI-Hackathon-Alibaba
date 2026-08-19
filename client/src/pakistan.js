// Pakistan provinces / territories → major cities.
// Used by the location picker so clinic results are relevant to the user
// instead of a fixed district. Not exhaustive, but covers the main cities of
// each province and territory.

export const PROVINCES = [
  {
    key: 'Punjab',
    urdu: 'پنجاب',
    cities: [
      'Lahore', 'Faisalabad', 'Rawalpindi', 'Multan', 'Gujranwala',
      'Sialkot', 'Bahawalpur', 'Sargodha', 'Sheikhupura', 'Jhang',
      'Rahim Yar Khan', 'Gujrat', 'Kasur', 'Okara', 'Sahiwal',
      'Dera Ghazi Khan', 'Mianwali', 'Chiniot', 'Vehari', 'Toba Tek Singh',
    ],
  },
  {
    key: 'Sindh',
    urdu: 'سندھ',
    cities: [
      'Karachi', 'Hyderabad', 'Sukkur', 'Larkana', 'Nawabshah',
      'Mirpur Khas', 'Jacobabad', 'Shikarpur', 'Khairpur', 'Dadu',
      'Thatta', 'Badin', 'Tando Adam', 'Ghotki', 'Umerkot',
    ],
  },
  {
    key: 'Khyber Pakhtunkhwa',
    urdu: 'خیبر پختونخوا',
    cities: [
      'Peshawar', 'Mardan', 'Abbottabad', 'Mingora (Swat)', 'Kohat',
      'Bannu', 'Dera Ismail Khan', 'Mansehra', 'Nowshera', 'Charsadda',
      'Swabi', 'Haripur', 'Batkhela', 'Timergara', 'Chitral',
    ],
  },
  {
    key: 'Balochistan',
    urdu: 'بلوچستان',
    cities: [
      'Quetta', 'Turbat', 'Khuzdar', 'Chaman', 'Gwadar',
      'Sibi', 'Zhob', 'Loralai', 'Dera Murad Jamali', 'Hub',
      'Mastung', 'Kalat', 'Pishin',
    ],
  },
  {
    key: 'Islamabad Capital Territory',
    urdu: 'اسلام آباد',
    cities: ['Islamabad'],
  },
  {
    key: 'Gilgit-Baltistan',
    urdu: 'گلگت بلتستان',
    cities: ['Gilgit', 'Skardu', 'Chilas', 'Hunza', 'Ghizer', 'Astore'],
  },
  {
    key: 'Azad Jammu & Kashmir',
    urdu: 'آزاد کشمیر',
    cities: ['Muzaffarabad', 'Mirpur', 'Rawalakot', 'Kotli', 'Bhimber', 'Bagh'],
  },
]

export function citiesFor(provinceKey) {
  const p = PROVINCES.find((x) => x.key === provinceKey)
  return p ? p.cities : []
}
