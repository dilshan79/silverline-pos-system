import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'dateFormat' })
export class DateFormatPipe implements PipeTransform {
  transform(value: string | Date | null | undefined, format: 'short' | 'long' | 'time' = 'short'): string {
    if (!value) return '—';
    const d = new Date(value);
    if (isNaN(d.getTime())) return '—';
    const opts: Intl.DateTimeFormatOptions =
      format === 'time'
        ? { hour: '2-digit', minute: '2-digit' }
        : format === 'long'
        ? { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
        : { day: '2-digit', month: 'short', year: 'numeric' };
    return new Intl.DateTimeFormat('en-LK', opts).format(d);
  }
}
