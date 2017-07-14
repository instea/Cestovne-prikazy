import './ExportForm.css';

import React, { Component } from 'react';
import {compose} from 'react-apollo';
import {Row, Col, ButtonToolbar, Button} from 'react-bootstrap';
import 'react-datetime/css/react-datetime.css';
import {connect} from 'react-redux';
import * as actions from '../../actions/exportActions';
import {reduxForm} from 'redux-form';
import ErrorMessage from '../../components//ErrorMessage';
import LoadingIndicator from 'react-loading-indicator';
import {getJwt} from '../../selectors/user';

class ExportForm extends Component {

  render() {
    return (
      <Row>
        <Col sm={12}>
          {this.props.err && <ErrorMessage>Problem preparing file</ErrorMessage>}
          <form onSubmit={this.props.handleSubmit}>
            TODO - filters
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

const mapStateToProps = (state) => ({
  loading: !!state._export.get('loading'),
  url: state._export.get('url'),
  err: !!state._export.get('error'),
  jwt: getJwt(state)
});

const mapDispatchToProps = (dispatch, ownProps) => ({
  onSubmit: (values) => {
    dispatch(actions.prepareExport(values, ownProps.jwt));
  }
});

export default compose(
  connect(
    mapStateToProps,
    mapDispatchToProps
  ),
  reduxForm({
    form: 'export'
  })
)(ExportForm);
