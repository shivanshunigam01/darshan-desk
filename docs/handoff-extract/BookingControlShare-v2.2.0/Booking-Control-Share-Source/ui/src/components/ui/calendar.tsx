import * as React from 'react'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/style.css'

import { cn } from '@/lib/utils'

function Calendar({ className, ...props }: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      className={cn('p-3', className)}
      classNames={{
        root: 'bg-background',
        months: 'flex flex-col sm:flex-row gap-4',
        month: 'space-y-4',
        month_caption: 'flex items-center justify-between px-1',
        caption_label: 'text-sm font-medium',
        nav: 'flex items-center gap-1',
        button_previous: 'inline-flex items-center justify-center rounded-md border bg-background h-8 w-8 text-sm hover:bg-accent',
        button_next: 'inline-flex items-center justify-center rounded-md border bg-background h-8 w-8 text-sm hover:bg-accent',
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'w-9 text-center text-[0.8rem] font-normal text-muted-foreground',
        week: 'flex w-full mt-2',
        day: 'relative flex w-9 h-9 items-center justify-center p-0 text-sm',
        day_button: 'inline-flex h-9 w-9 items-center justify-center rounded-md text-sm hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring',
        selected: 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
        today: 'border border-primary/40',
        outside: 'text-muted-foreground opacity-40',
        disabled: 'text-muted-foreground opacity-30 cursor-not-allowed',
        hidden: 'invisible',
      }}
      {...props}
    />
  )
}

export { Calendar }
