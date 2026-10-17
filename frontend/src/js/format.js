// Money is stored in kobo (1 naira = 100 kobo).
export function formatMoney(kobo) {
  const amount = (Number(kobo) / 100).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `₦${amount}`
}

// Times come from the server in UTC and are always shown in Nigerian time.
const dateFormat = new Intl.DateTimeFormat('en-NG', {
  timeZone: 'Africa/Lagos', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
})
const timeFormat = new Intl.DateTimeFormat('en-NG', {
  timeZone: 'Africa/Lagos', hour: 'numeric', minute: '2-digit', hour12: true,
})

export const formatDate = (iso) => dateFormat.format(new Date(iso))
export const formatTime = (iso) => timeFormat.format(new Date(iso))

// Today's date in Nigeria as YYYY-MM-DD (for the date picker)
export const todayInLagos = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date())

export const placesLeft = (n) => `${n} ${n === 1 ? 'place' : 'places'} left`
