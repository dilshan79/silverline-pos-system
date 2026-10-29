import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'currencyLkr'
})
export class CurrencyLkrPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    if (value === null || value === undefined) return 'Rs 0.00';
    return 'Rs ' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
