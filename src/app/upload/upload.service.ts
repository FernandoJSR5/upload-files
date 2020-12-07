import { Injectable } from '@angular/core';
import {
  HttpClient,
  HttpRequest,
  HttpEventType,
  HttpResponse,
} from '@angular/common/http';
import { Subject } from 'rxjs';
import { Observable } from 'rxjs';
import { Papa } from 'ngx-papaparse';
import * as Ajv from 'ajv';
import * as _ from 'lodash';

const url = 'http://localhost:8000/upload';
const ajv = new Ajv();

const branchSchema = {
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "busbari": { "type": "string" },
    "busbarf": { "type": "string" },
  },
  "additionalProperties": false
};

const branchHeader = ['name', 'busbarf', 'busbari']

@Injectable()
export class UploadService {
  constructor(private http: HttpClient, private papa: Papa) { }

  public upload(files: Set<File>): { [key: string]: { progress: Observable<number>, color: Observable<string> } } {

    // this will be the our resulting map
    const status: { [key: string]: { progress: Observable<number>, color: Observable<string> } } = {};

    files.forEach(file => {

      let result: any[] = [];
      this.papa.parse(file, {
        worker: true,
        header: true,
        dynamicTyping: true,
        comments: "#",
        step: (row, parser) => {
          if (!_.isEqual(row.meta.fields.sort(), branchHeader.sort())) {
            console.log("abort.");
            parser.abort();
          } else {
            result.push(row.data);
            console.log("continue...");
          }
        }
      });

      // create a http-post request and pass data
      // tell it to report the upload progress

      const data = {
        name: file.name,
        type: "branch",
        result: result
      }

      const req = new HttpRequest('POST', url, data, {
        reportProgress: true
      });

      // create a new progress-subject for every file
      const progress = new Subject<number>();

      // create a new color-subject for every file
      const color = new Subject<string>();

      setTimeout(() => {
        if (result.length > 0) {
          // send the http-request and subscribe for progress-updates
          this.http.request(req).subscribe(event => {
            if (event.type == HttpEventType.UploadProgress) {

              // calculate the progress percentage
              const percentDone = Math.round(100 * event.loaded);

              // pass the percentage into the progress-stream
              progress.next(percentDone);
              color.next('primary');
            } else if (event instanceof HttpResponse) {
              // Close the progress-stream if we get an answer form the API
              // The upload is complete
              color.complete();
              progress.complete();
            }
          });
        } else {
          color.next('warn');
          progress.next(Math.round(100));
          color.complete();
          progress.complete();
        }
      }, 1000)

      // Save every progress-observable and color-observable in a map of all observables
      status[file.name] = {
        progress: progress.asObservable(),
        color: color.asObservable()
      };
    });

    // return the map of observables
    return status;
  }
}