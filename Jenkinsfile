node {
    stage 'Checkout'
    checkout scm

    catchError {
      stage 'Tests'
      sh 'sh bin/test.sh'

      stage 'Build'
      sh 'sh bin/build.sh'
/*    // use when want to deply

      stage 'Deploy'
      dir('/opt/cestaky/src/') {
          sh 'rm -rf server src build public node_modules angular package.json'
      }
      sh 'cp -r -t /opt/cestaky/src server src build public node_modules angular package.json'
      dir('/opt/cestaky/src/') {
          sh 'sudo service cestaky restart'
      }
*/
    }
    step([$class: 'Mailer', notifyEveryUnstableBuild: true, recipients: 'dev@instea.co', sendToIndividuals: true])
}
