// Money is stored in kobo (1 naira = 100 kobo).
export function formatMoney(kobo, currency = 'NGN') {
  const amount = (Number(kobo) / 100).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return currency === 'NGN' ? `₦${amount}` : `${currency} ${amount}`
}

// Times are stored in UTC and always shown in Nigerian time.
const dateFormat = new Intl.DateTimeFormat('en-NG', {
  timeZone: 'Africa/Lagos', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
})
const timeFormat = new Intl.DateTimeFormat('en-NG', {
  timeZone: 'Africa/Lagos', hour: 'numeric', minute: '2-digit', hour12: true,
})

export const formatLagosDate = (iso) => dateFormat.format(new Date(iso))
export const formatLagosTime = (iso) => timeFormat.format(new Date(iso))