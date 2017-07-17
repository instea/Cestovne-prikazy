import './ExportForm.css';

import React, { Component } from 'react';
import {compose} from 'react-apollo';
import {Row, Col, ButtonToolbar, Button} from 'react-bootstrap';
import 'react-datetime/css/react-datetime.css';
import {connect} from 'react-redux';
import * as actions from '../../actions/exportActions';
import {reduxForm, Field} from 'redux-form';
import ErrorMessage from '../../components//ErrorMessage';
import LoadingIndicator from 'react-loading-indicator';
import {getUserInfo} from '../../selectors/user';
import {bindActionCreators} from 'redux';
import {ReduxFormUserCombobox} from '../../components/ConnectedComboboxes';
import {ReduxFormMonthPicker} from '../../components/FormHelpers';
import {required} from '../../core/validation';
import moment from 'moment';

class ExportForm extends Component {

  render() {
    return (
      <Row>
        <Col sm={12}>
          {this.props.err && <ErrorMessage>Problem preparing file</ErrorMessage>}
          <form onSubmit={this.props.handleSubmit}>
            <Field name="userId" label="Who:" id="userId" component={ReduxFormUserCombobox} />
            <Field name="month" label="Month:" id="month" component={ReduxFormMonthPicker} years={{
              min: 2017,
              max: moment().year()
            }}/>
            <Row>
              <Col xsOffset={4} xs={4} smOffset={3} sm={4} mdOffset={4} md={4} lgOffset={4} lg={4}>
                <ButtonToolbar>
                  <Button bsStyle="primary" type="submit">Generate</Button>
                  {this.props.loading && <LoadingIndicator />}
                  {this.props.url && (
                    <Button bsStyle="success" type="button" onClick={() => window.location.assign(this.props.url)}>Download</Button>
                  )}
                </ButtonToolbar>
              </Col>
            </Row>
          </form>
        </Col>
      </Row>
    );
  }

}

const validate = (values) => ({
  ...required(values, 'userId', 'month')
});

const mapStateToProps = (state) => ({
  loading: !!state._export.get('loading'),
  url: state._export.get('url'),
  err: !!state._export.get('error'),
  initialValues: {
    userId: (getUserInfo(state) || {}).id,
    month: moment().subtract(1, 'month')
  }
});

const mapDispatchToProps = (dispatch, ownProps) => bindActionCreators({
  onSubmit: (values) => actions.prepareExport(values)
}, dispatch);

export default compose(
  connect(
    mapStateToProps,
    mapDispatchToProps
  ),
  reduxForm({
    form: 'export',
    validate
  })
)(ExportForm);
