import React, { useContext } from 'react'
import Chart from 'react-google-charts'
const dayjs = require('dayjs')
const relativeTime = require('dayjs/plugin/relativeTime')
import {
  AutoSizer,
  BlockText,
  Card,
  CardBody,
  HeadingText,
  NerdGraphQuery,
  NerdletStateContext,
  NrqlQuery,
  PlatformStateContext,
  Spacing,
  Spinner,
} from 'nr1'
import { timeRangeToNrql } from '@newrelic/nr-labs-components'

const formatTimeRangeForDisplay = ({ timeRange }) => {
  if (!timeRange) return
  const { begin_time, end_time, duration } = timeRange

  if (duration) {
    dayjs.extend(relativeTime)
    const formatted = dayjs().to(dayjs().subtract(duration, 'ms'))
    return `Since ${formatted}`
  } else if (begin_time && end_time) {
    return `Since ${dayjs(begin_time).format('MMM DD hh:mm')} Until ${dayjs(
      end_time
    ).format('MMM DD hh:mm')}`
  } else {
    return 'Since 60 minutes ago'
  }
}

// Google Chart is opinionated about column order and data type and can't be changed.
// The labels are here for clarity in the code; they aren't actually used by the chart
const COLUMNS = [
  { label: 'Task Id', type: 'string', alias: 'taskId', mandatory: true },
  { label: 'Task Name', type: 'string', alias: 'taskName', mandatory: true },
  { label: 'Task Start', type: 'date', alias: 'start', mandatory: true },
  { label: 'Task End', type: 'date', alias: 'end', mandatory: true },
  { label: 'Duration', type: 'number', alias: 'duration' },
  { label: 'Percent Complete', type: 'number', alias: 'percentComplete' },
  { label: 'Dependencies', type: 'string', alias: 'dependencies' },
]

const initGanttProps = (ganttProps) => {
  if (!ganttProps.barCornerRadius) ganttProps.barCornerRadius = 1
  if (!ganttProps.barHeight) ganttProps.barHeight = 24
  if (!ganttProps.fontSize) ganttProps.fontSize = 10
  if (!ganttProps.fontColor) ganttProps.fontColor = 'inherit'
  if (!ganttProps.gridLineColor) ganttProps.gridLineWidth = 1
  if (!ganttProps.gridTrackColor) ganttProps.gridTrackColor = 'white'
  if (!ganttProps.gridAlternateTrackColor)
    ganttProps.gridAlternateTrackColor = 'white'
  if (!ganttProps.trackHeight) ganttProps.trackHeight = 25
}

const GanttChartVisualization = ({ nrqlQuery, ganttProps }) => {
  console.info('nrqlQuery', JSON.stringify(nrqlQuery))

  initGanttProps(ganttProps)
  console.info('ganttProps', ganttProps)

  const { filters } = useContext(NerdletStateContext)
  const platformContext = useContext(PlatformStateContext)

  const transformData = (rawData) => {
    const rows = []
    for (let entry of rawData?.actor?.account?.nrql?.results) {
      // console.info('entry', entry)

      const row = {}
      for (const { type, alias } of COLUMNS) {
        let val = entry[`latest.${alias}`] || entry[alias]
        if (val) {
          if (type === 'date') val = new Date(val)
        } else val = ''
        row[alias] = val
      }

      if (!row.end) {
        // if there's no end date, we assume the job is still running
        row.end = new Date()
        row.taskName = `(Running) ${row.taskName}`
      }

      // console.info('Row', row)
      if (row.start) {
        const vals = Object.values(row)
        // console.info('vals', vals)
        rows.push([...vals])
        // console.info('rows for entry', rows)
      }
    }
    console.info('rows', rows)
    return rows
  }

  const nrqlQueryPropsAvailable = nrqlQuery?.accountId && nrqlQuery?.query

  if (!nrqlQueryPropsAvailable) {
    return <EmptyState />
  }

  if (nrqlQuery.useTimePicker && nrqlQuery.query.includes('SINCE')) {
    return (
      <ErrorState
        errors={[
          {
            message: `Query includes multiple SINCE clauses; SINCE clauses are automatically calculated using the platform timepicker, so it isn't necessary to include one in your query string.`,
          },
        ]}
      />
    )
  }

  let mandatoryColumnsFound = true
  for (let col of COLUMNS) {
    if (col.mandatory) {
      const colOptions = [
        `as '${col.alias}'`,
        `AS '${col.alias}'`,
        `as ${col.alias}`,
        `AS ${col.alias}`,
      ]
      mandatoryColumnsFound = colOptions.some((opt) =>
        nrqlQuery.query.includes(opt)
      )
    }
    if (!mandatoryColumnsFound)
      return (
        <ErrorState
          errors={[
            {
              message: `Query is missing one or more mandatory aliases: taskId, taskName, start, end`,
            },
          ]}
        />
      )
  }

  const timeClause =
    platformContext?.timeRange && nrqlQuery.useTimePicker
      ? timeRangeToNrql(platformContext)
      : ''
  const filtersClause =
    nrqlQuery.enableFilters && filters ? ` WHERE ${filters} ` : ''
  const queryString = `${nrqlQuery.query} ${timeClause} ${filtersClause} `

  console.info('queryString', queryString)
  const query = `
    {
      actor {
        account(id: ${nrqlQuery.accountId}) {
          nrql(query: "${queryString}") {
            results
          }
        }
      }
    }
  `

  return (
    <AutoSizer>
      {({ width = '100%', height = '100%' }) => (
        <div
          className="gantt-chart"
          style={{ width, height, overflow: 'scroll', margin: 'auto' }}
        >
          <div className="subheader">
            {formatTimeRangeForDisplay(platformContext)}
          </div>
          <NerdGraphQuery
            query={query}
            pollInterval={NrqlQuery.AUTO_POLL_INTERVAL}
          >
            {({ data, loading, error }) => {
              console.info('width/height from autosizer', width, height)
              if (loading) {
                return <Spinner />
              }

              if (error?.graphQLErrors) {
                return <ErrorState errors={error.graphQLErrors} />
              }

              const chartData = transformData(data)
              if (!chartData || chartData.length === 0)
                return (
                  <ErrorState
                    title="No chart data available"
                    errors={[
                      {
                        message:
                          'No events found -- do you have the correct event type and time range?',
                      },
                    ]}
                  />
                )

              const chartHeight = ganttProps.trackHeight * chartData.length
              return (
                <Chart
                  chartType="Gantt"
                  loader={<Spinner />}
                  data={[COLUMNS, ...chartData]}
                  options={{
                    width: width,
                    height: chartHeight + 50,
                    gantt: {
                      criticalPathEnabled: false,
                      trackHeight: ganttProps.trackHeight,
                      barHeight: ganttProps.barHeight,
                      barCornerRadius: ganttProps.barCornerRadius,
                      // labelMaxWidth: '80%', for some reason this setting is being ignored by the chart
                      labelStyle: {
                        fontName: 'inherit',
                        fontSize: ganttProps.fontSize,
                        fontColor: ganttProps.fontColor,
                      },
                      innerGridHorizLine: {
                        stroke: ganttProps.gridLineColor,
                        strokeWidth: ganttProps.gridLineWidth,
                      },
                      innerGridTrack: { fill: ganttProps.gridTrackColor },
                      innerGridDarkTrack: {
                        fill: ganttProps.gridAlternateTrackColor,
                      },
                      sortTasks: ganttProps.sortTasks,
                    },
                  }}
                />
              )
            }}
          </NerdGraphQuery>
        </div>
      )}
    </AutoSizer>
  )
}

GanttChartVisualization.propTypes = {}

const EmptyState = () => (
  <Card className="EmptyState">
    <CardBody className="EmptyState-cardBody">
      <HeadingText
        spacingType={[
          HeadingText.SPACING_TYPE.LARGE,
          HeadingText.SPACING_TYPE.MEDIUM,
        ]}
        type={HeadingText.TYPE.HEADING_3}
      >
        Gantt Chart Set Up
      </HeadingText>
      <HeadingText
        spacingType={[HeadingText.SPACING_TYPE.MEDIUM]}
        type={HeadingText.TYPE.HEADING_4}
      >
        Query Syntax
      </HeadingText>
      <BlockText spacingType={[BlockText.SPACING_TYPE.MEDIUM]}>
        In order to populate a Gantt Chart, there are a few data requirements:
        <Spacing type={[Spacing.TYPE.MEDIUM, Spacing.TYPE.EXTRA_LARGE]}>
          <ul>
            <li>A unique identifier for each task instance.</li>
            <li>A task name</li>
            <li>A timestamp for the start of the task, in milliseconds</li>
            <li>A timestamp for the end of the task, in milliseconds</li>
          </ul>
        </Spacing>
        <Spacing type={[Spacing.TYPE.MEDIUM]}>
          <div>A valid query for the chart would look like this: </div>
        </Spacing>
        <Spacing type={[Spacing.TYPE.MEDIUM, Spacing.TYPE.LARGE]}>
          <code>
            FROM Tasks SELECT latest(jobName) as 'taskName',
            latest(startTimestamp) as 'start', latest(endTimestamp) as 'end'
            FACET jobId as 'taskId' limit max
          </code>
        </Spacing>
        <Spacing type={[Spacing.TYPE.MEDIUM]}>
          <div>
            <span style={{ fontWeight: '600', paddingRight: '8px' }}>
              Note:
            </span>
            You need to use the aliases as shown above, so the chart knows how
            to plot to the data.
          </div>
        </Spacing>
      </BlockText>
      <HeadingText
        spacingType={[
          HeadingText.SPACING_TYPE.LARGE,
          HeadingText.SPACING_TYPE.MEDIUM,
        ]}
        type={HeadingText.TYPE.HEADING_4}
      >
        Additional Properties
      </HeadingText>
      <BlockText spacingType={[BlockText.SPACING_TYPE.MEDIUM]}>
        Use the settings found in <strong>Gantt Chart Configuration</strong> to
        alter the appearance of the chart. Review the tooltips provided for more
        information on each attribute.
      </BlockText>
    </CardBody>
  </Card>
)

const ErrorState = ({ title = 'An error occurred', errors = [] }) => (
  <Card className="ErrorState">
    <CardBody className="ErrorState-cardBody">
      <HeadingText
        className="ErrorState-headingText"
        spacingType={[HeadingText.SPACING_TYPE.MEDIUM]}
        type={HeadingText.TYPE.HEADING_3}
      >
        {title}
      </HeadingText>
      {errors.map((err) => (
        <BlockText
          spacingType={[BlockText.SPACING_TYPE.MEDIUM]}
          style={{ fontSize: '14px' }}
        >
          {err.message}
        </BlockText>
      ))}
    </CardBody>
  </Card>
)

export default GanttChartVisualization
