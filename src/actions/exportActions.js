import request from 'superagent';

export const PREPARE_EXPORT = 'PREPARE_EXPORT';
export const PREPARE_EXPORT_SUCCESS = 'PREPARE_EXPORT_SUCCESS';
export const PREPARE_EXPORT_FAILURE = 'PREPARE_EXPORT_FAILURE';

export function prepareExport(values, jwt) {
  return (dispatch) => {

    dispatch({
      type: PREPARE_EXPORT,
      values
    });

    request
      .post('/export')
      .send(values)
      .auth(jwt || '', {
        type: 'bearer'
      })
      .end((err, res) => {
        if (err || !res.ok) {
          return dispatch({
            type: PREPARE_EXPORT_FAILURE
          });
        }

        dispatch({
          type: PREPARE_EXPORT_SUCCESS,
          url: res.body
        });
      });
  };
}
