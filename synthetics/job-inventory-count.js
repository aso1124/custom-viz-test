// #######
// Script to generate data for gantt chart testing
// #######

const ACCOUNT = { id: 0, name: '', key: '' }

// ######
// 1. Create the job event
// ######

const getRandomMinutes = (min, max) => {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

const start = new Date()
const end = new Date(start.getTime() + getRandomMinutes(30,120)*60000);

const payload = [
  	{
		"eventType": "Jobs",
		"account": ACCOUNT.id,
		"jobName": "Inventory - Count",
		"jobId": $env.JOB_ID,
		"startTimestamp": start.getTime()
	},
	{
		"eventType": "Jobs",
		"account": ACCOUNT.id,
		"jobName": "Inventory - Count",
		"jobId": $env.JOB_ID,
		"endTimestamp": end.getTime()
	},
]

console.info('posting job to account', ACCOUNT.name)

$http.post(
  {
    uri: `https://insights-collector.newrelic.com/v1/accounts/${ACCOUNT.id}/events`,
    headers: { 'X-Insert-Key': ACCOUNT.key },
    json: payload
  },
  (error, response, body) => {
    if (!error && response.statusCode == 200)
      console.log(
        `Posted job to account ${ACCOUNT.id}`
      )
    else {
      console.log(`Error posting to insights`)
      console.error('error', error)
      console.info('response status code', response.statusCode)
      console.info('body', body)
    }
  }
)
