import { PipeTransform, Injectable, ArgumentMetadata } from '@nestjs/common';

/**
 * Pipe to normalize array query parameters with bracket notation.
 * Converts `categories[]=value` to `categories=value` in the query object.
 */
@Injectable()
export class NormalizeArrayQueryPipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata) {
    if (metadata.type === 'query' && value && typeof value === 'object') {
      const normalized: any = { ...value };
      
      // Find all keys ending with '[]' and normalize them
      for (const key in normalized) {
        if (key.endsWith('[]')) {
          const normalizedKey = key.slice(0, -2); // Remove '[]'
          // If the normalized key already exists, merge arrays
          if (normalized[normalizedKey]) {
            const existing = Array.isArray(normalized[normalizedKey]) 
              ? normalized[normalizedKey] 
              : [normalized[normalizedKey]];
            const newValue = Array.isArray(normalized[key])
              ? normalized[key]
              : [normalized[key]];
            normalized[normalizedKey] = [...existing, ...newValue];
          } else {
            // Move the value to the normalized key
            normalized[normalizedKey] = normalized[key];
          }
          // Remove the old key with brackets
          delete normalized[key];
        }
      }
      
      return normalized;
    }
    return value;
  }
}

